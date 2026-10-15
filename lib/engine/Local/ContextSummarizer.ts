/**
 * ContextSummarizer
 *
 * Compresión automática de historial cuando el contexto supera un umbral.
 * No importa LlamaLocal — recibe el contexto como parámetro para evitar
 * ciclos de imports con LocalInference.ts.
 */

import { Logger } from '@lib/state/Logger'

export type SummarizerConfig = {
    triggerRatio: number
    recentCount: number
    summaryMaxTokens: number
    summaryTemperature: number
}

export const defaultSummarizerConfig: SummarizerConfig = {
    triggerRatio: 0.75,
    recentCount: 8,
    summaryMaxTokens: 300,
    summaryTemperature: 0.3,
}

function getActiveText(entry: any): string {
    const active = entry?.swipes?.find((s: any) => s.active) ?? entry?.swipes?.[0]
    return active?.swipe?.trim() ?? ''
}

function estimateTokens(entries: any[]): number {
    const total = entries.reduce((acc, e) => acc + getActiveText(e).length, 0)
    return Math.floor(total / 4)
}

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

/**
 * @param messages      Array de ChatEntry
 * @param contextLength n_ctx configurado
 * @param llamaContext  Contexto del modelo ya cargado (LlamaContext de cui-llama.rn)
 * @param cfg           Configuración del summarizer
 */
export async function maybeSummarizeContext(
    messages: any[],
    contextLength: number,
    llamaContext: any,
    cfg: SummarizerConfig = defaultSummarizerConfig
): Promise<any[]> {
    if (messages.length === 0 || !llamaContext) return messages

    const threshold = Math.floor(contextLength * cfg.triggerRatio)
    const estimated = estimateTokens(messages)

    if (estimated < threshold) return messages

    Logger.info(
        `[Summarizer] ~${estimated} tokens / umbral ${threshold}. Comprimiendo...`
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

    let summary = ''
    try {
        await llamaContext.completion(
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
        `[Summarizer] OK — ${toCompress.length} msgs → 1 resumen (${summary.length} chars)`
    )

    return [firstEntry, makeSummaryEntry(summary), ...recentEntries]
}
