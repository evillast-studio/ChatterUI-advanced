import { JinjaFormattedChatResult } from 'cui-llama.rn'
import { t } from 'i18next'

import { CompletionTimings } from '@db/schema'
import { AppSettings } from '@lib/constants/GlobalValues'
import { SamplerConfigData, SamplerID, Samplers } from '@lib/constants/SamplerData'
import { isCloseThinkTag, isOpenThinkTag } from '@lib/markdown/ThinkTags'
import { Characters } from '@lib/state/Characters'
import { Chats, useInference } from '@lib/state/Chat'
import { commonStopStrings, Instructs, outputPrefixes } from '@lib/state/Instructs'
import { Logger } from '@lib/state/Logger'
import { SamplersManager } from '@lib/state/SamplerState'
import { useTTSStore } from '@lib/state/TTS'
import { mmkv } from '@lib/storage/MMKV'

import { APIConfiguration, APISampler, APIValues } from './API/APIBuilder.types'
import {
    buildChatCompletionContext,
    buildTextCompletionContext,
    ContextBuilderParams,
} from './API/ContextBuilder'
import { Llama, LlamaConfig } from './Local/LlamaLocal'
import { chatCacheManager } from './Local/ChatCacheManager'
import { KV } from './Local/Model'

export const localSamplerData: APISampler[] = [
    { externalName: 'n_predict', samplerID: SamplerID.GENERATED_LENGTH },
    { externalName: 'temperature', samplerID: SamplerID.TEMPERATURE },
    { externalName: 'top_p', samplerID: SamplerID.TOP_P },
    { externalName: 'top_k', samplerID: SamplerID.TOP_K },
    { externalName: 'min_p', samplerID: SamplerID.MIN_P },
    { externalName: 'typical_p', samplerID: SamplerID.TYPICAL },
    { externalName: 'mirostat', samplerID: SamplerID.MIROSTAT_MODE },
    { externalName: 'mirostat_tau', samplerID: SamplerID.MIROSTAT_TAU },
    { externalName: 'mirostat_eta', samplerID: SamplerID.MIROSTAT_ETA },
    { externalName: 'grammar', samplerID: SamplerID.GRAMMAR_STRING },
    { externalName: 'penalty_last_n', samplerID: SamplerID.REPETITION_PENALTY_RANGE },
    { externalName: 'penalty_repeat', samplerID: SamplerID.REPETITION_PENALTY },
    { externalName: 'penalty_present', samplerID: SamplerID.PRESENCE_PENALTY },
    { externalName: 'enable_thinking', samplerID: SamplerID.ENABLE_THINKING },
    { externalName: 'penalty_freq', samplerID: SamplerID.FREQUENCY_PENALTY },
    { externalName: 'xtc_t', samplerID: SamplerID.XTC_THRESHOLD },
    { externalName: 'xtc_p', samplerID: SamplerID.XTC_PROBABILITY },
    { externalName: 'seed', samplerID: SamplerID.SEED },
    { externalName: 'dry_base', samplerID: SamplerID.DRY_BASE },
    { externalName: 'dry_allowed_length', samplerID: SamplerID.DRY_ALLOWED_LENGTH },
    { externalName: 'dry_multiplier', samplerID: SamplerID.DRY_MULTIPLIER },
    { externalName: 'dry_sequence_breakers', samplerID: SamplerID.DRY_SEQUENCE_BREAK },
    { externalName: 'thinking_budget_tokens', samplerID: SamplerID.REASONING_MAX_TOKENS },
]

const getSamplerFields = (max_length?: number) => {
    const preset: SamplerConfigData = SamplersManager.getCurrentSampler()
    return localSamplerData
        .map((item: APISampler) => {
            const value = preset[item.samplerID]
            const samplerItem = Samplers[item.samplerID]
            let cleanvalue = value
            if (typeof value === 'number')
                if (item.samplerID === 'max_length' && max_length) {
                    cleanvalue = Math.min(value, max_length)
                } else if (samplerItem.values.type === 'integer') cleanvalue = Math.floor(value)
            if (item.samplerID === SamplerID.DRY_SEQUENCE_BREAK) {
                //@ts-expect-error. This is due to a migration
                cleanvalue = (value as string).split(',')
            }
            return { [item.externalName as SamplerID]: cleanvalue }
        })
        .reduce((acc, obj) => Object.assign(acc, obj), {})
}

const buildLocalPayload = async () => {
    const payloadFields = getSamplerFields()
    const rep_pen = payloadFields?.['penalty_repeat']
    const reasoning = payloadFields?.['enable_thinking'] as boolean
    let thinkTags = {}
    const localPreset: LlamaConfig = Llama.useLlamaPreferencesStore.getState().config
    let prompt: undefined | string = undefined
    let mediaPaths: string[] = []
    const context = Llama.useLlamaModelStore.getState().context

    const fields = await obtainFields()

    if (!fields) {
        return Logger.error('Failed to build fields')
    }

    const { apiConfig, ...rest } = fields

    const completionType = apiConfig.request.completionType
    if (context && (await context.isMultimodalEnabled())) {
        const mtmdSupport = await context.getMultimodalSupport()
        if (completionType.type === 'chatCompletions') {
            completionType.supportsAudio = mtmdSupport?.audio
            completionType.supportsImages = mtmdSupport?.vision
            apiConfig.request.completionType = completionType
        }
    }
    const hasAudio = completionType.type === 'chatCompletions' && completionType.supportsAudio
    const hasImage = completionType.type === 'chatCompletions' && completionType.supportsImages
    const bufferExists = !!Chats.useChatState.getState().buffer.data

    if (mmkv.getBoolean(AppSettings.UseModelTemplate)) {
        const messages = await buildChatCompletionContext({ apiConfig, ...rest })
        try {
            if (messages) {
                const result = await Llama.useLlamaModelStore
                    .getState()
                    .context?.getFormattedChat(messages, null, {
                        jinja: true,
                        enable_thinking: reasoning,
                    })
                if (typeof result === 'string') prompt = result
                // Currently not used since we dont pass in { jinja: true }
                else if (typeof result === 'object') {
                    prompt = result.prompt
                    mediaPaths = result.media_paths ?? []
                    if (reasoning && result.type === 'jinja') {
                        const jinjaResult = result as JinjaFormattedChatResult
                        const thinking_end_tag = jinjaResult.thinking_end_tag
                        const thinking_start_tag = jinjaResult.thinking_start_tag
                        const thinking_forced_open = true

                        if (thinking_end_tag && thinking_start_tag)
                            thinkTags = {
                                thinking_end_tag,
                                thinking_start_tag,
                                thinking_forced_open,
                            }
                    }

                    if (mediaPaths.length > 0 && !hasImage && !hasAudio) {
                        Logger.warnToast(t('model.toast.mediaAddedWithoutMultimodalSupport'))
                    }
                }
            }
        } catch (e) {
            Logger.error(`Failed to use template: ${e}`)
        }

        // we assume that if the buffer is filled during completion
        // this is a continue sequence
        // we need to remove the trailing <close_tag> and <think> tags
        if (bufferExists && prompt) {
            const removalList = ['<think>', ...outputPrefixes, ...commonStopStrings]
            let trimmedInput = prompt.trim()
            for (const removal of removalList) {
                const test = removal.trim()
                if (trimmedInput.endsWith(test)) {
                    const matchIndex = trimmedInput.lastIndexOf(test)
                    if (matchIndex !== -1) {
                        trimmedInput = trimmedInput.slice(0, matchIndex).trim()
                    }
                }
            }
            prompt = trimmedInput
        }
    }
    if (!prompt) {
        prompt = await buildTextCompletionContext({ apiConfig, ...rest })
    }

    if (!prompt) {
        Logger.errorToast(t('generation.errors.failedToBuildPrompt'))
        return
    }

    const finalMediaPaths = hasAudio || hasImage ? { media_paths: mediaPaths } : {}

    return {
        ...payloadFields,
        penalize_nl: typeof rep_pen === 'number' && rep_pen > 1,
        n_threads: localPreset.threads,
        prompt: prompt ?? '',
        stop: constructStopSequence(),
        emit_partial_completion: true,
        // Reutiliza el KV cache del prompt anterior para evitar re-escaneos
        cache_prompt: mmkv.getBoolean(AppSettings.CachePrompt) ?? true,
        ...finalMediaPaths,
        ...thinkTags,
    }
}

const constructStopSequence = (): string[] => {
    // kept this helper for extendability
    return Instructs.useInstruct.getState().getStopSequence()
}

const stopGenerating = () => {
    // kept this helper for extendability
    useInference.getState().stopGenerating()
}

const constructReplaceStrings = (): string[] => {
    // default stop strings defined instructs
    const stops: string[] = constructStopSequence()
    // additional stop strings based on context configuration
    //    const output: string[] = []
    //  return [...stops, ...output]
    return stops
}

const verifyModelLoaded = async (): Promise<boolean> => {
    const model = Llama.useLlamaModelStore.getState().model

    // Model Loading Routine
    if (!model) {
        const lastModel = Llama.useLlamaPreferencesStore.getState().lastModel
        const autoLoad = mmkv.getBoolean(AppSettings.AutoLoadLocal)
        // If  autoload is disabled, just return
        if (!autoLoad) {
            Logger.warnToast(t('model.toast.noModelLoaded'))
            return false
        }

        // by default, autoload will attempt to load the last model used
        if (!lastModel) {
            Logger.warnToast(t('model.toast.noAutoLoadModelSet'))
            return false
        }

        // attempt to load model
        if (lastModel) {
            Logger.infoToast(t('model.toast.autoLoadingModel', { name: lastModel.name }))
            await Llama.useLlamaModelStore.getState().load(lastModel)
        }

        const lastMmproj = Llama.useLlamaPreferencesStore.getState().lastMmproj
        if (lastMmproj) {
            Logger.infoToast(t('model.toast.autoLoadingMMPROJ', { name: lastMmproj.name }))
            await Llama.useLlamaModelStore.getState().loadMmproj(lastMmproj)
        }
    }
    return true
}

/** Mínimo de tokens en común para que valga la pena cargar el KV guardado de un chat. */
const MIN_REUSE_TOKENS = 64

/** Si el KV por chat está activo (por defecto sí). */
const isChatKVEnabled = () => mmkv.getBoolean(AppSettings.SaveLocalKV) ?? true

/** Guardado de KV en curso: la siguiente generación espera a que termine. */
let kvSavePromise: Promise<void> = Promise.resolve()

const commonPrefixLength = (a: number[], b: number[]) => {
    const limit = Math.min(a.length, b.length)
    let i = 0
    while (i < limit && a[i] === b[i]) i++
    return i
}

/** Restaura el KV guardado del chat activo si aporta algo para este prompt. */
const restoreChatKV = async (chatId: number, prompt: string, mediaPaths?: string[]) => {
    if (KV.useKVStore.getState().loadedChatId === chatId) return
    if (!chatCacheManager.hasSession(chatId)) return

    const saved = await chatCacheManager.readTokens(chatId)
    if (saved && saved.length > 0) {
        const tokens = (await Llama.useLlamaModelStore.getState().tokenize(prompt, mediaPaths))
            ?.tokens
        const common = commonPrefixLength(saved, tokens ?? [])
        if (common < MIN_REUSE_TOKENS) {
            Logger.info(`[KV] Chat ${chatId}: solo ${common} tokens en común, no se carga`)
            return
        }
        Logger.info(`[KV] Chat ${chatId}: ${common}/${saved.length} tokens reutilizables`)
    }
    // Si no hay tokens guardados se carga igual: llama.cpp reutiliza el prefijo que coincida
    await Llama.useLlamaModelStore.getState().loadKVForChat(chatId)
}

export const localInference = async () => {
    try {
        // Model Loading Routine
        if (!(await verifyModelLoaded())) {
            return stopGenerating()
        }

        // verify that model has been loaded
        const context = Llama.useLlamaModelStore.getState().context

        if (!context) {
            Logger.warnToast(t('model.toast.noModelLoaded'))
            stopGenerating()
            return
        }

        await kvSavePromise

        const payload = await buildLocalPayload()

        if (!payload) {
            Logger.warnToast(t('generation.errors.failedToBuildPayload'))
            stopGenerating()
            return
        }

        const chatId = Chats.useChatState.getState().id
        if (chatId && isChatKVEnabled()) {
            await restoreChatKV(chatId, payload.prompt, payload.media_paths)
        }

        await runLocalCompletion(payload)
    } catch (e) {
        Logger.errorToast(t('model.toast.failedToRunLocalInference'), e)
        stopGenerating()
    }
}

const runLocalCompletion = async (
    payload: NonNullable<Awaited<ReturnType<typeof buildLocalPayload>>>
) => {
    const stopRegex = RegExp(
        constructReplaceStrings()
            .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join(`|`),
        'g'
    )

    const cleanStopString = (text: string) => {
        return text.replaceAll(stopRegex, '')
    }

    useInference.getState().setAbort(async () => {
        await Llama.useLlamaModelStore.getState().stopCompletion()
    })

    let reasoningMode = false
    const outputStream = (text: string) => {
        const cleaned = cleanStopString(text)
        Chats.useChatState.getState().insertToBuffer(cleaned)
        /**
         * @TODO implement think seperation for TTS
         */
        if (reasoningMode) {
            if (isCloseThinkTag(cleaned)) {
                reasoningMode = false
            }
            return
        }

        if (isOpenThinkTag(cleaned)) {
            reasoningMode = true
            return
        }
        // insertBuffer hace su propio check de enabled/liveTTS en tiempo real
        useTTSStore.getState().insertBuffer(cleaned)
    }

    const outputCompleted = (text: string, timings: CompletionTimings) => {
        Chats.useChatState.getState().setBufferTimings(timings)
        if (mmkv.getBoolean(AppSettings.PrintContext)) Logger.info(`Completion Output:\n${text}`)
        stopGenerating()

        // Guardar el KV de este chat (con ctx_shift/swa_full también es válido: saveSession
        // devuelve los tokens que realmente quedaron).
        const chatId = Chats.useChatState.getState().id
        if (chatId && isChatKVEnabled()) {
            kvSavePromise = Llama.useLlamaModelStore
                .getState()
                .saveKVForChat(chatId, payload.prompt, payload.media_paths ?? [])
                .catch((e) => Logger.error(`[KV] No se pudo guardar el chat ${chatId}: ${e}`))
        }
    }

    const engineData = Llama.useLlamaPreferencesStore.getState().config

    await Llama.useLlamaModelStore
        .getState()
        .completion({ ...payload, n_threads: engineData.threads }, outputStream, outputCompleted)
        .catch((error) => {
            Logger.errorToast(t('model.toast.failedToGenerateLocally'), JSON.stringify(error))
            stopGenerating()
        })
}

const localAPIValues: APIValues = {
    endpoint: '',
    modelEndpoint: '',
    prefill: '',
    firstMessage: '',
    key: '',
    model: undefined,
    configName: 'Local',
}

// This is a dummy we use to hijack chat completions builder
const localAPIConfig: APIConfiguration = {
    version: 1,
    name: 'Local',

    defaultValues: {
        endpoint: '',
        modelEndpoint: '',
        prefill: '',
        firstMessage: '',
        key: '',
        model: undefined,
    },

    features: {
        usePrefill: false,
        useFirstMessage: false,
        useKey: true,
        useModel: true,
        multipleModels: false,
    },

    request: {
        requestType: 'stream',
        samplerFields: [],
        completionType: {
            type: 'chatCompletions',
            userRole: 'user',
            systemRole: 'system',
            assistantRole: 'assistant',
            contentName: 'content',
        },
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
        responseParsePattern: 'choices.0.delta.content',
        useStop: true,
        stopKey: 'stop',
        promptKey: 'messages',
        removeLength: true,
    },

    payload: {
        type: 'openai',
    },

    model: {
        useModelContextLength: false,
        nameParser: '',
        contextSizeParser: '',
        modelListParser: '',
    },

    ui: {
        editableCompletionPath: false,
        editableModelPath: false,
        selectableModel: false,
    },
}

// This is the 'big orchestrator' which compiles fields from
// the whole app to send inference requests
const obtainFields = async (): Promise<ContextBuilderParams | void> => {
    try {
        const userState = Characters.useUserStore.getState()
        const characterState = Characters.useCharacterStore.getState()

        const instructState = Instructs.useInstruct.getState()

        const userCard = userState.card
        if (!userCard) {
            Logger.errorToast(t('generation.errors.noUser'))
            return
        }

        const characterCard = characterState.card
        if (!characterCard) {
            Logger.errorToast(t('generation.errors.noCharacter'))
            return
        }
        const chatId = await Chats.useChatState.getState().id
        if (!chatId) {
            Logger.errorToast(t('generation.errors.noActiveChat'))
            return
        }

        const messages = (await Chats.db.query.chat(chatId))?.messages
        if (!messages) {
            Logger.errorToast(t('generation.errors.noChatFound'))
            return
        }

        const apiValues = localAPIValues
        if (!apiValues) {
            Logger.warnToast(t('generation.errors.noActiveAPI'))
            return
        }

        const apiConfig = localAPIConfig
        if (!apiConfig) {
            Logger.errorToast(
                t('generation.errors.configurationNotFound', { name: apiValues?.configName })
            )
            return
        }

        const engineData = Llama.useLlamaPreferencesStore.getState().config
        const samplers = SamplersManager.getCurrentSampler()

        const instructLength = engineData.context_length
        const length = Math.max(instructLength - samplers.genamt, 0)

        return {
            apiConfig: Object.assign({}, apiConfig),
            apiValues: Object.assign({}, apiValues),

            instruct: instructState.replacedMacros(),
            character: Object.assign({}, characterCard),
            user: Object.assign({}, userCard),
            messages: [...messages],
            chatTokenizer: async (entry, index) => {
                // IMPORTANT - we use -1 for dummy entries
                if (entry.id === -1) return 0
                const [activeSwipe] = entry.swipes.filter((item) => item.active)
                if (!activeSwipe) return 0
                const tokenCount = activeSwipe.token_count ?? 0
                if (tokenCount === 0 && activeSwipe.swipe.length > 0) {
                    // assume that token length hasnt been calculated
                    const tokenCount = await Llama.useLlamaModelStore.getState().tokenLength(
                        activeSwipe.swipe,
                        entry.attachments.map((item) => item.uri)
                    )
                    Chats.db.mutate.updateSwipeTokenLength(activeSwipe.id, tokenCount)
                }

                return tokenCount
            },
            tokenizer: Llama.useLlamaModelStore.getState().tokenLength,
            maxLength: length,
            cache: {
                userCache: await userState.getCache(characterCard.name),
                characterCache: await characterState.getCache(userCard.name),
                instructCache: await instructState.getCache(characterCard.name, userCard.name),
            },
        }
    } catch (e) {
        Logger.errorToast(t('generation.errors.failedToOrchestrateRequestBuild'), e)
    }
}
