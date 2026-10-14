/**
 * ContextSummarizer
 *
 * Compresión automática de historial cuando el contexto supera un umbral.
 * Usa el modelo ya cargado en Llama.useLlamaModelStore — sin API externa.
 *
 * Flujo:
 *   1. Estimar tokens del historial (~4 chars = 1 token)
 *   2. Si supera triggerRatio del n_ctx → resumir mensajes intermedios
 *   3. Devolver [firstEntry, summaryEntry, ...recentEntries]
 */

import { Logger } from '@lib/state/Logger'

import { Llama } from './LlamaLocal'

export type SummarizerConfig = {
    /** Fracción del contexto en la que se activa (0.0–1.0) */
    triggerRatio: number
    /** Mensajes recientes a conservar sin comprimir */
    recentCount: number
    /** Máx tokens del resumen */
    summaryMaxTokens: number
    /** Temperatura baja para resúmenes factuales */
    summaryTemperature: number
}

export const defaultSummarizerConfig: SummarizerConfig = {
    triggerRatio: 0.75,
    recentCount: 8,
    summaryMaxTokens: 300,
    summaryTemperature: 0.3,
}

// Extrae el texto activo de un mensaje
function getActiveText(entry: any): string {
    const active = entry?.swipes?.find((s: any) => s.active) ?? entry?.swipes?.[0]
    return active?.swipe?.trim() ?? ''
}

// Estima tokens: 1 token ≈ 4 caracteres
function estimateTokens(entries: any[]): number {
    const total = entries.reduce((acc, e) => acc + getActiveText(e).length, 0)
    return Math.floor(total / 4)
}

// Crea una entrada sintética de sistema con el resumen
function makeSummaryEntry(summary: string): any {
    return {
        id: -2,
        chat_id: -1,
        order: 0,
        is_user: false,
        attachments: [],
        swipes: [{
            id: -2,
            entry_id: -2,
            swipe: `[Contexto previo resumido]: ${summary}`,
            active: true,
            token_count: null,
            finish_reason: '',
            timings: null,
        }],
    }
}

export async function maybeSummarizeContext(
    messages: any[],
    contextLength: number,
    cfg: SummarizerConfig = defaultSummarizerConfig
): Promise<any[]> {
    if (messages.length === 0) return messages

    const threshold = Math.floor(contextLength * cfg.triggerRatio)
    const estimated = estimateTokens(messages)

    if (estimated < threshold) return messages

    Logger.info(
        `[Summarizer] ~${estimated} tokens estimados / umbral ${threshold}. Comprimiendo...`
    )

    const firstEntry = messages[0]
    const recentEntries = messages.slice(-cfg.recentCount)
    const toCompress = messages.slice(1, messages.length - cfg.recentCount)

    if (toCompress.length === 0) return messages

    const historyText = toCompress
        .map((e: any) => {
            const text = getActiveText(e)
            if (!text) return null
            return `${e.is_user ? 'USER' : 'ASSISTANT'}: ${text}`
        })
        .filter(Boolean)
        .join('\n')

    const summaryPrompt =
        `Resume en un párrafo conciso los siguientes mensajes. ` +
        `Incluye personajes, decisiones, información importante y estado actual. ` +
        `Sin comentarios, solo el resumen:\n\n${historyText}`

    const llamaStore = Llama.useLlamaModelStore.getState()
    if (!llamaStore.context) {
        Logger.warn('[Summarizer] Sin modelo cargado, omitiendo compresión.')
        return messages
    }

    let summary = ''
    try {
        await llamaStore.context.completion(
            {
                prompt: summaryPrompt,
                n_predict: cfg.summaryMaxTokens,
                temperature: cfg.summaryTemperature,
                stop: ['\nUSER:', '\nASSISTANT:', '\n\n\n'],
                emit_partial_completion: false,
                cache_prompt: false,
            },
            (data: any) => { summary += data.token }
        )
    } catch (e) {
        Logger.error('[Summarizer] Error al generar resumen, usando historial completo.', e)
        return messages
    }

    summary = summary.trim()
    if (!summary) return messages

    Logger.info(
        `[Summarizer] OK — ${toCompress.length} mensajes → 1 resumen (${summary.length} chars)`
    )

    return [firstEntry, makeSummaryEntry(summary), ...recentEntries]
}
