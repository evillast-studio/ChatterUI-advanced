import { closeFd, getContentFd } from '@vali98/react-native-fs'
import {
    CompletionParams,
    ContextParams,
    initLlama,
    LlamaContext,
    RNLLAMA_MTMD_DEFAULT_MEDIA_MARKER,
} from 'cui-llama.rn'
import { t } from 'i18next'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { ModelDataType } from '@db/schema'
import { Storage } from '@lib/enums/Storage'
import { AppDirectory, fileExists, readableFileSize, writeBase64File } from '@lib/utils/File'

import { chatCacheManager } from './ChatCacheManager'
import { checkGGMLDeprecated } from './GGML'
import { KV, Model } from './Model'
import { AppSettings } from '../../constants/GlobalValues'
import { Logger } from '../../state/Logger'
import { createMMKVStorage, mmkv } from '../../storage/MMKV'

export type CompletionTimings = {
    predicted_per_token_ms: number
    predicted_per_second: number | null
    predicted_ms: number
    predicted_n: number

    prompt_per_token_ms: number
    prompt_per_second: number | null
    prompt_ms: number
    prompt_n: number
}

export type CompletionOutput = {
    text: string
    timings: CompletionTimings
}

export type LlamaState = {
    context: LlamaContext | undefined
    model?: ModelDataType
    mmproj?: ModelDataType
    loadProgress: number
    chatCount: number
    promptCache?: string
    load: (model: ModelDataType) => Promise<void>
    loadMmproj: (model: ModelDataType) => Promise<void>
    setLoadProgress: (progress: number) => void
    unload: () => Promise<void>
    unloadMmproj: () => Promise<void>
    saveKV: (prompt: string | undefined, media_paths?: string[]) => Promise<void>
    loadKV: () => Promise<boolean>
    /** Guarda el KV cache en un archivo por chatId. Independiente de SaveLocalKV. */
    saveKVForChat: (chatId: number, prompt: string, media_paths?: string[]) => Promise<void>
    /** Carga el KV cache de un chatId específico. Retorna true si tuvo éxito. */
    loadKVForChat: (chatId: number) => Promise<boolean>
    /** Elimina el archivo de cache de un chat específico (tras edición o borrado). */
    invalidateChatKV: (chatId: number) => Promise<void>
    completion: (
        params: CompletionParams,
        callback: (text: string) => void,
        completed: (text: string, timngs: CompletionTimings) => void
    ) => Promise<void>
    stopCompletion: () => Promise<void>
    tokenLength: (text: string, mediaPaths?: string[]) => Promise<number>
    tokenize: (text: string, media_paths?: string[]) => Promise<{ tokens: number[] } | undefined>
}

export type LlamaConfig = {
    // CPU
    context_length: number
    threads: number
    batch: number
    ubatch: number
    use_mmap: boolean
    use_mlock: boolean
    // GPU / Backend
    gpu_layers: number
    force_gpu_device: boolean
    devices: string[]
    // Math & Precision / KV Cache
    cache_type_k: string
    cache_type_v: string
    flash_attn: boolean
    kv_unified: boolean
    // Context Management
    ctx_shift: boolean
    swa_full: boolean
    n_keep: number
    defrag_thold: number
    no_kv_offload: boolean
}

export type EngineDataProps = {
    config: LlamaConfig
    lastModel?: ModelDataType
    lastMmproj?: ModelDataType
    setConfiguration: (config: LlamaConfig) => void
    setLastModelLoaded: (model: ModelDataType | undefined) => void
    setLastMmprojLoaded: (model: ModelDataType | undefined) => void
    maybeClearLastLoaded: (mode: ModelDataType) => void
}

const sessionFile = `${AppDirectory.SessionPath}llama-session.bin`

const defaultConfig: LlamaConfig = {
    // CPU
    context_length: 4096,
    threads: 4,
    batch: 512,
    ubatch: 64,
    use_mmap: true,
    use_mlock: false,
    // GPU / Backend
    gpu_layers: 0,
    force_gpu_device: false,
    devices: [],
    // Math & Precision
    cache_type_k: 'f16',
    cache_type_v: 'f16',
    flash_attn: false,
    kv_unified: false,
    // Context Management
    ctx_shift: true,
    swa_full: false,
    n_keep: 320,
    defrag_thold: 0.02,
    no_kv_offload: true,   // GPU matmul + CPU KV cache — preset gpu_cpu_hybrid
}

export namespace Llama {
    export const useLlamaPreferencesStore = create<EngineDataProps>()(
        persist(
            (set, get) => ({
                config: defaultConfig,
                setConfiguration: (config: LlamaConfig) => {
                    set({ config: config })
                },
                setLastModelLoaded: (model: ModelDataType | undefined) => {
                    if (get().lastModel?.id === model?.id) return
                    set({ lastModel: model, lastMmproj: undefined })
                },
                setLastMmprojLoaded: (mmproj: ModelDataType | undefined) => {
                    set({ lastMmproj: mmproj })
                },
                maybeClearLastLoaded: (data) => {
                    if (data.id === get().lastModel?.id) {
                        set({ lastModel: undefined, lastMmproj: undefined })
                    } else if (data.id === get().lastMmproj?.id) {
                        set({ lastMmproj: undefined })
                    }
                },
            }),
            {
                name: Storage.EngineData,
                partialize: (state) => ({
                    config: state.config,
                    lastModel: state.lastModel,
                    lastMmproj: state.lastMmproj,
                }),
                storage: createMMKVStorage(),
                version: 5,
                migrate: (persistedState: any, version) => {
                    if (version === 1) {
                        persistedState.config.ctx_shift = true
                        Logger.info('Migrated to v2 EngineData')
                    }
                    if (version === 2) {
                        persistedState.config.devices = []
                        Logger.info('Migrated to v3 EngineData')
                    }
                    if (version === 3) {
                        persistedState.config.ubatch = 64
                        persistedState.config.n_keep = 320
                        persistedState.config.defrag_thold = 0.02
                        Logger.info('Migrated to v4 EngineData (ubatch/n_keep/defrag_thold)')
                    }
                    if (version === 4) {
                        persistedState.config.use_mmap = true
                        persistedState.config.use_mlock = false
                        persistedState.config.force_gpu_device = false
                        persistedState.config.cache_type_k = 'f16'
                        persistedState.config.cache_type_v = 'f16'
                        persistedState.config.flash_attn = false
                        persistedState.config.kv_unified = false
                        persistedState.config.swa_full = false
                        persistedState.config.no_kv_offload = true
                        Logger.info('Migrated to v5 EngineData (math/precision/gpu/context fields)')
                    }
                    return persistedState
                },
            }
        )
    )

    export const useLlamaModelStore = create<LlamaState>()((set, get) => ({
        context: undefined,
        loadProgress: 0,
        chatCount: 0,
        promptCache: undefined,
        load: async (model: ModelDataType) => {
            const config = useLlamaPreferencesStore.getState().config

            if (get()?.model?.id === model.id) {
                return Logger.errorToast(t('model.toast.modelAlreadyLoaded'))
            }

            if (checkGGMLDeprecated(parseInt(model.quantization))) {
                return Logger.errorToast(t('model.toast.quantizationNoLongerSupported'))
            }

            if (!(await Model.getModelExists(model.file_path))) {
                Logger.errorToast(t('model.toast.modelDoesNotExist'))
                Model.verifyModelList()
                return
            }

            if (get().context !== undefined) {
                await get().unload()
            }

            let model_path = model.file_path
            if (model.file_path.includes('content://')) {
                model_path = (await getContentFd(model_path)) ?? model_path
            }

            const params: ContextParams = {
                model: model_path,
                n_ctx: config.context_length,
                n_threads: config.threads,
                n_batch: config.batch,
                n_ubatch: config.ubatch,
                use_mmap: config.use_mmap,
                use_mlock: config.use_mlock,
                n_gpu_layers: config.gpu_layers,
                // force_gpu_device is passed via devices selection
                devices: config.force_gpu_device && config.devices.length > 0
                    ? config.devices
                    : config.devices,
                cache_type_k: config.cache_type_k,
                cache_type_v: config.cache_type_v,
                flash_attn: config.flash_attn,
                kv_unified: config.kv_unified,
                ctx_shift: config.ctx_shift,
                swa_full: config.swa_full,
                n_keep: config.n_keep,
                defrag_thold: config.defrag_thold,
                no_kv_offload: config.no_kv_offload,
            }

            Logger.info(
                `\n------ MODEL LOAD -----\n Model Name: ${model.name}\nContext: ${params.n_ctx} | Threads: ${params.n_threads} | Batch: ${params.n_batch} | uBatch: ${params.n_ubatch}\nGPU Layers: ${params.n_gpu_layers} | Flash Attn: ${params.flash_attn}\nKV Cache K: ${params.cache_type_k} | V: ${params.cache_type_v}\nn_keep: ${params.n_keep} | defrag_thold: ${params.defrag_thold} | ctx_shift: ${params.ctx_shift}`
            )

            const progressCallback = (progress: number) => {
                if (progress % 5 === 0) get().setLoadProgress(progress)
            }

            const llamaContext = await initLlama(params, progressCallback).catch((error) => {
                Logger.errorToast(t('model.toast.couldNotLoadModel'), JSON.stringify(error))
                if (model.file_path.includes('content://')) {
                    closeFd(model_path)
                }
            })

            if (!llamaContext) return

            set({
                context: llamaContext,
                model: model,
                chatCount: 1,
            })

            // updated EngineData
            useLlamaPreferencesStore.getState().setLastModelLoaded(model)
            KV.useKVStore.getState().setKvCacheLoaded(false)
        },
        loadMmproj: async (model: ModelDataType) => {
            const context = get().context
            if (!context) return

            let model_path = model.file_path
            if (model.file_path.includes('content://')) {
                model_path = (await getContentFd(model_path)) ?? model_path
            }

            Logger.info('Loading MMPROJ')
            await context.initMultimodal({ path: model_path, use_gpu: true }).catch((e) => {
                if (model.file_path.includes('content://')) {
                    closeFd(model_path)
                }

                Logger.errorToast(t('model.toast.failedToLoadMMPROJ'), e)
            })
            if (await context.isMultimodalEnabled()) {
                const capabilities = await context.getMultimodalSupport()
                Logger.info(
                    `MMPROJ Loaded:\n- Vision: ${capabilities.vision}\n- Audio: ${capabilities.audio}`
                )
            }

            set({
                mmproj: model,
            })

            useLlamaPreferencesStore.getState().setLastMmprojLoaded(model)
        },
        setLoadProgress: (progress: number) => {
            set({ loadProgress: progress })
        },
        unload: async () => {
            if (get().mmproj) {
                await get().context?.releaseMultimodal()
            }

            await get().context?.release()
            set({
                context: undefined,
                model: undefined,
                mmproj: undefined,
            })
            Logger.info('Model Unloaded')
        },
        unloadMmproj: async () => {
            if (!get().mmproj) return
            await get()
                .context?.releaseMultimodal()
                .catch((e) => {
                    Logger.errorToast(t('model.toast.failedToUnloadMMPROJ'), e)
                })
            set({
                mmproj: undefined,
            })
        },
        completion: async (
            params: CompletionParams,
            callback = (text: string) => {},
            completed = (text: string) => {}
        ) => {
            const llamaContext = get().context
            if (llamaContext === undefined) {
                Logger.errorToast(t('model.toast.noModelLoaded'))
                return
            }

            return llamaContext
                .completion(params, (data) => {
                    callback(data.token)
                })
                .then(async ({ text, timings }: CompletionOutput) => {
                    completed(text, timings)
                    Logger.info(
                        `\n---- Start Chat ${get().chatCount} ----\n${textTimings(timings)}\n---- End Chat ${get().chatCount} ----\n`
                    )
                    set({ chatCount: get().chatCount + 1 })
                    if (mmkv.getBoolean(AppSettings.SaveLocalKV)) {
                        await get().saveKV(params.prompt, params.media_paths ?? [])
                    }
                })
        },
        stopCompletion: async () => {
            await get().context?.stopCompletion()
        },
        saveKV: async (prompt, media_paths) => {
            const llamaContext = get().context
            if (!llamaContext) {
                Logger.errorToast(t('model.toast.noModelLoaded'))
                return
            }

            if (prompt) {
                const tokens = (await get().tokenize(prompt, media_paths ?? []))?.tokens
                KV.useKVStore.getState().setKvCacheTokens(tokens ?? [])
            }

            if (!fileExists(sessionFile)) {
                Logger.warn('Session file does not exist, creating...')
                await writeBase64File(sessionFile, '')
            }

            const now = performance.now()
            const data = await llamaContext.saveSession(sessionFile.replace('file://', ''))
            Logger.info(
                data === -1
                    ? 'Failed to save KV cache'
                    : `Saved KV in ${Math.floor(performance.now() - now)}ms with ${data} tokens`
            )
            Logger.info(`Current KV Size is: ${readableFileSize(await KV.getKVSize())}`)
        },
        loadKV: async () => {
            let result = false
            const llamaContext = get().context
            if (!llamaContext) {
                Logger.errorToast(t('model.toast.noModelLoaded'))
                return false
            }
            if (!fileExists(sessionFile)) {
                Logger.warn('No Cache found')
                return false
            }
            await llamaContext
                .loadSession(sessionFile.replace('file://', ''))
                .then(() => {
                    Logger.info('Session loaded from KV cache')
                    result = true
                })
                .catch(() => {
                    Logger.error('Session loaded could not load from KV cache')
                })
            return result
        },
        saveKVForChat: async (chatId, prompt, media_paths = []) => {
            const llamaContext = get().context
            if (!llamaContext) return

            const now = performance.now()
            const sessionPath = chatCacheManager.getSessionPath(chatId)

            // saveSession retorna el número de tokens efectivamente guardados en el .bin.
            // Con ctx_shift, este número es <= tokens del prompt original (los tokens
            // desplazados no están). Guardamos exactamente esos tokens para verificación.
            const savedTokenCount = await llamaContext
                .saveSession(sessionPath.replace('file://', ''))
                .catch(() => -1)

            if (savedTokenCount === -1) {
                Logger.warn(`[KV] saveSession falló para chat ${chatId}`)
                return
            }

            // Tokenizamos el prompt completo y tomamos solo los primeros N tokens
            // que quedaron en el KV — eso es lo que el próximo loadSession restaurará
            const allTokens = (await get().tokenize(prompt, media_paths))?.tokens ?? []
            const effectiveTokens = allTokens.slice(0, savedTokenCount)

            KV.useKVStore.getState().setKvCacheTokens(effectiveTokens)
            KV.useKVStore.getState().setCachedChatId(chatId)

            Logger.info(
                `[KV] Chat ${chatId} guardado en ${Math.floor(performance.now() - now)}ms` +
                ` (${savedTokenCount}/${allTokens.length} tokens en KV)`
            )
        },
        loadKVForChat: async (chatId) => {
            const llamaContext = get().context
            if (!llamaContext) return false

            const sessionPath = chatCacheManager.getSessionPath(chatId)
            const exists = await (await import('@vali98/react-native-fs')).default.exists(sessionPath)
            if (!exists) return false

            const now = performance.now()
            let ok = false
            await llamaContext
                .loadSession(sessionPath.replace('file://', ''))
                .then(() => {
                    ok = true
                    Logger.info(
                        `[KV] Chat ${chatId} cargado en ${Math.floor(performance.now() - now)}ms`
                    )
                })
                .catch((e) => {
                    Logger.warn(`[KV] loadSession falló para chat ${chatId}, eliminando cache`, e)
                    chatCacheManager.deleteChatSession(chatId)
                })
            return ok
        },
        invalidateChatKV: async (chatId) => {
            await chatCacheManager.deleteChatSession(chatId)
            // Si el cache en memoria era de este chat, marcarlo como no cargado
            if (KV.useKVStore.getState().cachedChatId === chatId) {
                KV.useKVStore.getState().setKvCacheLoaded(false)
                KV.useKVStore.getState().setCachedChatId(null)
                KV.useKVStore.getState().setKvCacheTokens([])
            }
            Logger.info(`[KV] Cache invalidado para chat ${chatId}`)
        },
        tokenLength: async (text: string, mediaPaths: string[] = []) => {
            const finalPaths = get().mmproj ? mediaPaths : []
            if (!get().mmproj && mediaPaths.length > 0) {
                Logger.warnToast(t('model.toast.mediaAddedWithoutMMPROJModel'))
            }
            const result = await get().context?.tokenize(
                text + finalPaths.map(() => RNLLAMA_MTMD_DEFAULT_MEDIA_MARKER).join(),
                {
                    media_paths: finalPaths.map((item) => item.replace('file://', '')),
                }
            )
            if (!result) return 0
            return result.tokens.length
        },
        tokenize: async (text: string, media_paths: string[] = []) => {
            const params = get().mmproj ? { media_paths } : {}
            return await get().context?.tokenize(text, params)
        },
    }))

    const textTimings = (timings: CompletionTimings) => {
        return (
            `\n[Prompt Timings]` +
            (timings.prompt_n > 0
                ? `\nPrompt Per Token: ${timings.prompt_per_token_ms.toFixed(2)} ms/token` +
                  `\nPrompt Per Second: ${timings.prompt_per_second?.toFixed(2) ?? 0} tokens/s` +
                  `\nPrompt Time: ${(timings.prompt_ms / 1000).toFixed(2)}s` +
                  `\nPrompt Tokens: ${timings.prompt_n} tokens`
                : '\nNo Tokens Processed') +
            `\n\n[Predicted Timings]` +
            (timings.predicted_n > 0
                ? `\nPredicted Per Token: ${timings.predicted_per_token_ms.toFixed(2)} ms/token` +
                  `\nPredicted Per Second: ${timings.predicted_per_second?.toFixed(2) ?? 0} tokens/s` +
                  `\nPrediction Time: ${(timings.predicted_ms / 1000).toFixed(2)}s` +
                  `\nPredicted Tokens: ${timings.predicted_n} tokens\n`
                : '\nNo Tokens Generated')
        )
    }
}
