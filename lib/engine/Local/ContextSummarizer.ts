/**
 * ContextSummarizer
 *
 * Compresión automática de historial cuando el contexto supera un umbral.
 * Traduce el algoritmo Python de resumen a TypeScript usando el modelo ya
 * cargado en Llama.useLlamaModelStore — sin API externa.
 *
 * Flujo:
 *   1. Estimar tokens del historial completo
 *   2. Si supera el umbral → resumir mensajes intermedios con el modelo local
 *   3. Devolver [system_entry, summary_entry, ...recientes]
 *
 * El resumen se inserta como una entrada de sistema sintética (is_user: false, id: -2)
 * que el ContextBuilder trata igual que cualquier otro mensaje del personaje.
 */

import { ChatEntry } from '@lib/state/Chat'
import { Logger } from '@lib/state/Logger'

import { Llama } from './LlamaLocal'

// ─── Configuración ────────────────────────────────────────────────────────────

export type SummarizerConfig = {
    /** Fracción del contexto total en la que se activa la compresión (0.0–1.0) */
    triggerRatio: number
    /** Cuántos mensajes recientes conservar sin comprimir */
    recentCount: number
    /** Máx. tokens del resumen generado */
    summaryMaxTokens: number
    /** Temperatura baja para resúmenes factuales */
    summaryTemperature: number
}

export const defaultSummarizerConfig: SummarizerConfig = {
    triggerRatio: 0.75,   // activa al 75% del contexto disponible
    recentCount: 8,        // mantiene los últimos 8 turnos sin comprimir
    summaryMaxTokens: 300,
    summaryTemperature: 0.3,
}

// ─── Utilidades internas ──────────────────────────────────────────────────────

/** Extrae el texto activo de una ChatEntry */
function getActiveSwipeText(entry: ChatEntry): string {
    const active = entry.swipes.find((s) => s.active) ?? entry.swipes[0]
    return active?.swipe?.trim() ?? ''
}

/** Estima tokens: 1 token ≈ 4 caracteres (igual que el script Python) */
function estimateTokens(entries: ChatEntry[]): number {
    const total = entries.reduce((acc, e) => acc + getActiveSwipeText(e).length, 0)
    return Math.floor(total / 4)
}

/** Crea una entrada sintética de sistema con el resumen */
function makeSummaryEntry(summary: string): ChatEntry {
    return {
        id: -2,           // id especial — ChatTokenizer retorna 0 para ids negativos
        chat_id: -1,
        order: 0,
        is_user: false,
        is_summary: true, // flag opcional para UI futura
        attachments: [],
        swipes: [
            {
                id: -2,
                entry_id: -2,
                swipe: `[Contexto previo resumido]: ${summary}`,
                active: true,
                token_count: null,
                finish_reason: '',
                timings: null,
            } as any,
        ],
    } as any
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Comprime el historial si supera el umbral de tokens.
 *
 * @param messages  Array completo de ChatEntry (sin el dummy de system prompt de ChatterUI)
 * @param contextLength  n_ctx configurado por el usuario
 * @param cfg  Configuración del summarizer (usa defaults si no se pasa)
 * @returns El mismo array o uno comprimido con una entrada de resumen
 */
export async function maybeSummarizeContext(
    messages: ChatEntry[],
    contextLength: number,
    cfg: SummarizerConfig = defaultSummarizerConfig
): Promise<ChatEntry[]> {
    if (messages.length === 0) return messages

    const threshold = Math.floor(contextLength * cfg.triggerRatio)
    const estimated = estimateTokens(messages)

    if (estimated < threshold) return messages

    Logger.info(
        `[ContextSummarizer] Umbral alcanzado: ~${estimated} tokens estimados / ${threshold} (${Math.round(cfg.triggerRatio * 100)}% de ${contextLength}). Comprimiendo historial...`
    )

    // Separar: primer mensaje (suele ser el greeting del personaje o entrada de sistema),
    // mensajes recientes a conservar intactos, y el bloque intermedio a comprimir.
    const firstEntry = messages[0]
    const recentEntries = messages.slice(-cfg.recentCount)
    const toCompress = messages.slice(1, messages.length - cfg.recentCount)

    if (toCompress.length === 0) {
        Logger.info('[ContextSummarizer] No hay mensajes intermedios que comprimir.')
        return messages
    }

    // Construir el prompt de resumen
    const historyText = toCompress
        .map((entry) => {
            const text = getActiveSwipeText(entry)
            if (!text) return null
            const role = entry.is_user ? 'USER' : 'ASSISTANT'
            return `${role}: ${text}`
        })
        .filter(Boolean)
        .join('\n')

    const summaryPrompt =
        `Resume en un párrafo conciso los siguientes mensajes de una conversación. ` +
        `Incluye: personajes mencionados, decisiones tomadas, información importante y estado actual. ` +
        `Sin comentarios, solo el resumen:\n\n${historyText}`

    // Generar el resumen con el modelo local ya cargado
    const llamaStore = Llama.useLlamaModelStore.getState()
    if (!llamaStore.context) {
        Logger.warn('[ContextSummarizer] No hay modelo cargado, omitiendo compresión.')
        return messages
    }

    let summary = ''

    try {
        await llamaStore.context
            .completion(
                {
                    prompt: summaryPrompt,
                    n_predict: cfg.summaryMaxTokens,
                    temperature: cfg.summaryTemperature,
                    stop: ['\nUSER:', '\nASSISTANT:', '\n\n\n'],
                    emit_partial_completion: false,
                    cache_prompt: false, // resumen no debe contaminar el cache principal
                },
                (data) => {
                    summary += data.token
                }
            )
            .catch((e) => {
                throw e
            })
    } catch (e) {
        Logger.error('[ContextSummarizer] Error al generar resumen, usando historial completo.', e)
        return messages // falla de forma segura
    }

    summary = summary.trim()
    if (!summary) {
        Logger.warn('[ContextSummarizer] Resumen vacío, usando historial completo.')
        return messages
    }

    Logger.info(
        `[ContextSummarizer] Resumen generado (${summary.length} chars). ` +
        `Comprimidos ${toCompress.length} mensajes → 1 entrada de resumen.`
    )

    return [
        firstEntry,
        makeSummaryEntry(summary),
        ...recentEntries,
    ]
}
