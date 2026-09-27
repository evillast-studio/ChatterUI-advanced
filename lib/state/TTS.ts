import * as Speech from 'expo-speech'
import { t } from 'i18next'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { Storage } from '@lib/enums/Storage'
import { Logger } from '@lib/state/Logger'
import { createMMKVStorage } from '@lib/storage/MMKV'

import { Chats, useInference } from './Chat'

/** Perfil de voz por chatId — permite voz diferente por conversación */
type ChatVoiceProfile = {
    voice?: Speech.Voice
    rate?: number
}

type TTSState = {
    activeSwipeId?: number
    voice?: Speech.Voice
    enabled: boolean
    auto: boolean
    rate: number
    /** Mapa de perfiles de voz por chatId */
    chatVoiceProfiles: Record<number, ChatVoiceProfile>
    startTTS: (text: string, swipeId: number) => Promise<void>
    stopTTS: () => Promise<void>
    setEnabled: (b: boolean) => void
    setAuto: (b: boolean) => void
    setVoice: (v: Speech.Voice) => void
    setRate: (r: number) => void
    setLiveTTS: (b: boolean) => void
    /** Asigna un perfil de voz a un chat específico */
    setChatVoiceProfile: (chatId: number, profile: ChatVoiceProfile) => void
    /** Elimina el perfil de voz de un chat (vuelve al global) */
    removeChatVoiceProfile: (chatId: number) => void
    /** Retorna la voz y rate efectivos para un chatId (perfil propio o global) */
    getEffectiveVoice: (chatId?: number) => { voice?: Speech.Voice; rate: number }

    speak: (text: string, onDone?: () => void, onStop?: () => void) => void
    handleEndGeneration: (swipeId: number, text: string) => Promise<void>
    handleStartGeneration: (swipeId: number) => void
    // stream TTS
    liveTTS: boolean
    pauseLive?: boolean
    setPauseLive: (b: boolean) => void
    buffer: string
    clearAndRunBuffer: (lastIndex: number) => void
    clearBuffer: () => void
    /**
     * Inserts text into the buffer, attempts TTS if valid sentence and adds remainder to buffer.
     * El check de enabled/liveTTS se hace aquí — no necesita check externo.
     */
    insertBuffer: (text: string) => void
}

/**
 * Regex para detectar fin de oración.
 * No usa flag /g para evitar problemas de lastIndex entre llamadas.
 */
const sentenceEndRegex =
    /(?<=[^\d])([。…？！.?!])(?:["'`*_)]*)\s+(?=[A-Z0-9])|([。…？！.?!])(?:["'`*_)]*)\s*$/m

useInference.subscribe(async ({ nowGenerating }) => {
    const chatId = Chats.useChatState.getState().id
    if (!chatId) return
    const swipe = await Chats.db.query.chatLatestSwipe(chatId)
    if (!swipe) return

    if (!nowGenerating) {
        useTTSStore.getState().handleEndGeneration(swipe.id, swipe.swipe)
    } else {
        useTTSStore.getState().handleStartGeneration(swipe.id)
    }
})

export const useTTSStore = create<TTSState>()(
    persist(
        (set, get) => ({
            voice: undefined,
            enabled: false,
            auto: false,
            liveTTS: false,
            rate: 1,
            activeSwipeId: undefined,
            chatVoiceProfiles: {},

            setChatVoiceProfile: (chatId, profile) => {
                set((state) => ({
                    chatVoiceProfiles: {
                        ...state.chatVoiceProfiles,
                        [chatId]: { ...state.chatVoiceProfiles[chatId], ...profile },
                    },
                }))
            },
            removeChatVoiceProfile: (chatId) => {
                set((state) => {
                    const next = { ...state.chatVoiceProfiles }
                    delete next[chatId]
                    return { chatVoiceProfiles: next }
                })
            },
            getEffectiveVoice: (chatId) => {
                const state = get()
                if (chatId !== undefined) {
                    const profile = state.chatVoiceProfiles[chatId]
                    if (profile) {
                        return {
                            voice: profile.voice ?? state.voice,
                            rate: profile.rate ?? state.rate,
                        }
                    }
                }
                return { voice: state.voice, rate: state.rate }
            },

            startTTS: async (text: string, swipeId: number) => {
                const clearIndex = () => {
                    if (get().activeSwipeId === swipeId) set({ activeSwipeId: undefined })
                }

                const chatId = Chats.useChatState.getState().id
                const { voice: currentSpeaker, rate } = get().getEffectiveVoice(chatId)

                Logger.info('Starting TTS')
                if (currentSpeaker === undefined) {
                    Logger.errorToast(t('tts.nospeaker'))
                    clearIndex()
                    return
                }
                if (await Speech.isSpeakingAsync()) await Speech.stop()

                const cleaned = cleanMarkdown(text)
                if (!cleaned.trim()) {
                    clearIndex()
                    return
                }

                // Dividir en frases usando el mismo regex del buffer
                const chunks = splitIntoSentences(cleaned)
                if (chunks.length === 0) {
                    clearIndex()
                    return
                }

                Logger.debug('TTS started with ' + chunks.length + ' chunks')
                set({ activeSwipeId: swipeId })
                try {
                    chunks.forEach((chunk, index) =>
                        Speech.speak(chunk, {
                            language: currentSpeaker.language,
                            voice: currentSpeaker.identifier,
                            rate,
                            onDone: () => {
                                if (index === chunks.length - 1) clearIndex()
                            },
                            onStopped: () => clearIndex(),
                        })
                    )
                } catch (e) {
                    Logger.error(`Failed to run TTS: ${e}`)
                    clearIndex()
                }
            },

            stopTTS: async () => {
                Logger.info('TTS stopped')
                set({ buffer: '', activeSwipeId: undefined, pauseLive: get().liveTTS })
                await Speech.stop()
            },

            setEnabled: (b: boolean) => set({ enabled: b }),
            setAuto: (b: boolean) => set({ auto: b }),
            setVoice: (v: Speech.Voice) => set({ voice: v }),
            setRate: (r: number) => set({ rate: r }),
            setLiveTTS: (b: boolean) => set({ liveTTS: b }),
            setPauseLive: (b: boolean) => set({ pauseLive: b }),

            speak: (text, onDone = () => {}, onStop = () => {}) => {
                const chatId = Chats.useChatState.getState().id
                const { voice: currentSpeaker, rate } = get().getEffectiveVoice(chatId)
                Speech.speak(text, {
                    language: currentSpeaker?.language,
                    voice: currentSpeaker?.identifier,
                    rate,
                    onDone,
                    onStopped: onStop,
                })
            },

            handleEndGeneration: async (swipeId, text) => {
                if (!get().enabled) return
                if (get().liveTTS) {
                    get().clearAndRunBuffer(swipeId)
                } else if (get().auto) {
                    await get().stopTTS()
                    get().startTTS(text, swipeId)
                }
            },

            handleStartGeneration: async (swipeId) => {
                if (get().enabled && get().liveTTS) {
                    await Speech.stop()
                    set({ activeSwipeId: swipeId })
                }
                set({ pauseLive: false })
            },

            // Stream Data
            buffer: '',
            clearAndRunBuffer: (lastIndex) => {
                const buffer = get().buffer
                if (!get().pauseLive && buffer.trim()) {
                    const clean = cleanMarkdown(buffer)
                    if (clean) {
                        set({ activeSwipeId: lastIndex })
                        get().speak(clean, () => set({ activeSwipeId: undefined }))
                    }
                } else {
                    set({ activeSwipeId: undefined })
                }
                set({ buffer: '' })
            },
            clearBuffer: () => {
                set({ buffer: '' })
            },
            insertBuffer: (text: string) => {
                // Check en tiempo real — captura cambios de estado durante la generación
                const state = get()
                if (!state.enabled || !state.liveTTS || state.pauseLive) return

                const newBuffer = state.buffer + text

                // Buscar el último fin de oración en el buffer acumulado
                let lastMatchEnd = -1
                let searchFrom = 0
                let m: RegExpExecArray | null
                const globalRegex =
                    /(?<=[^\d])([。…？！.?!])(?:["'`*_)]*)\s+(?=[A-Z0-9])|([。…？！.?!])(?:["'`*_)]*)\s*$/gm

                while ((m = globalRegex.exec(newBuffer)) !== null) {
                    lastMatchEnd = m.index + m[0].length
                    searchFrom = lastMatchEnd
                    if (searchFrom >= newBuffer.length) break
                }

                if (lastMatchEnd !== -1) {
                    const fullSentence = newBuffer.slice(0, lastMatchEnd).trim()
                    const remainder = newBuffer.slice(lastMatchEnd)
                    const clean = cleanMarkdown(fullSentence)
                    if (clean) get().speak(clean)
                    set({ buffer: remainder })
                } else {
                    set({ buffer: newBuffer })
                }
            },
        }),
        {
            name: Storage.TTS,
            storage: createMMKVStorage(),
            version: 2,
            migrate: (persisted: any, version: number) => {
                if (version < 2) {
                    return { ...persisted, chatVoiceProfiles: {} }
                }
                return persisted
            },
            partialize: (state) => ({
                enabled: state.enabled,
                auto: state.auto,
                voice: state.voice,
                rate: state.rate,
                liveTTS: state.liveTTS,
                chatVoiceProfiles: state.chatVoiceProfiles,
            }),
        }
    )
)

/**
 * Divide texto limpio en frases para TTS.
 * Preserva la puntuación al final de cada frase.
 */
function splitIntoSentences(text: string): string[] {
    const parts = text.split(
        /(?<=[^\d][。…？！.?!]["'`*_)]*)\s+(?=[A-Z0-9])/
    )
    return parts
        .map((s) => s.trim())
        .filter(Boolean)
}

/**
 * Limpia el texto para TTS:
 * - Elimina bloques de código
 * - Elimina etiquetas <think> y su contenido
 * - Elimina markdown (negrita, cursiva, etc.)
 * - Elimina etiquetas HTML/XML
 */
const cleanMarkdown = (text: string): string => {
    return text
        // Bloques de código
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]*`/g, '')
        // Bloques de pensamiento <think>
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        // Etiquetas HTML/XML
        .replace(/<\/?[^>]+>/g, '')
        // Referencias de notas al pie
        .replace(/\[\^.*?\]\(.*?\)/g, '')
        // Markdown restante (negrita, cursiva, etc.)
        .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
        .replace(/[*_"]/g, '')
        .trim()
}
