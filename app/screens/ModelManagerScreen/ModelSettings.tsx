import { useFocusEffect } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useMMKVBoolean, useMMKVNumber } from 'react-native-mmkv'
import Animated, { Easing, SlideInRight, SlideOutRight } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'

import ThemedButton from '@components/buttons/ThemedButton'
import HorizontalSelector from '@components/input/HorizontalSelector'
import ThemedSlider from '@components/input/ThemedSlider'
import ThemedSwitch from '@components/input/ThemedSwitch'
import SectionTitle from '@components/text/SectionTitle'
import Alert from '@components/views/Alert'
import { AppSettings, Global } from '@lib/constants/GlobalValues'
import { Llama } from '@lib/engine/Local/LlamaLocal'
import { KV } from '@lib/engine/Local/Model'
import useBackendDevices from '@lib/hooks/BackendDevices'
import { Logger } from '@lib/state/Logger'
import { Theme } from '@lib/theme/ThemeManager'
import { readableFileSize } from '@lib/utils/File'

type ModelSettingsProp = {
    modelImporting: boolean
    modelLoading: boolean
    exit: () => void
}

const KV_CACHE_TYPES = ['f16', 'f32', 'q8_0', 'q6_k', 'q5_1', 'q5_0', 'q4_1', 'q4_0', 'iq4_nl']

const deviceLabels: Record<string, string> = {
    GPUOpenCL: 'OpenCL',
    HTP0: 'Hexagon',
    CPU: 'CPU',
    Vulkan: 'Vulkan',
    RNPU: 'RNPU',
}

const ModelSettings: React.FC<ModelSettingsProp> = ({ modelImporting, modelLoading, exit }) => {
    const { t } = useTranslation()
    const { color, spacing, borderRadius, fontSize } = Theme.useTheme()
    const { config, setConfig, profiles, saveProfile, loadProfile, deleteProfile, renameProfile } =
        Llama.useLlamaPreferencesStore(
            useShallow((state) => ({
                config: state.config,
                setConfig: state.setConfiguration,
                profiles: state.profiles,
                saveProfile: state.saveProfile,
                loadProfile: state.loadProfile,
                deleteProfile: state.deleteProfile,
                renameProfile: state.renameProfile,
            }))
        )

    const devices = useBackendDevices()

    const [saveKV, setSaveKV] = useMMKVBoolean(AppSettings.SaveLocalKV)
    const [autoloadLocal, setAutoloadLocal] = useMMKVBoolean(AppSettings.AutoLoadLocal)
    const [showModelInChat, setShowModelInChat] = useMMKVBoolean(AppSettings.ShowModelInChat)
    const [disableLogs, setDisableLogs] = useMMKVBoolean(AppSettings.DisableLogs)
    const [cachePrompt, setCachePrompt] = useMMKVBoolean(AppSettings.CachePrompt)
    const [summarizeContext, setSummarizeContext] = useMMKVBoolean(AppSettings.ContextSummarize)
    const [summaryTrigger, setSummaryTrigger] = useMMKVNumber(AppSettings.SummaryTriggerRatio)
    const [summaryRecent, setSummaryRecent] = useMMKVNumber(AppSettings.SummaryRecentCount)
    const [threadCount] = useMMKVNumber(Global.CPUThreads)

    const [kvSize, setKVSize] = useState(0)
    const [newProfileName, setNewProfileName] = useState('')
    const [renamingProfile, setRenamingProfile] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')

    useEffect(() => {
        KV.getKVSize().then(setKVSize)
    }, [])

    const getKVSize = async () => {
        const size = await KV.getKVSize()
        setKVSize(size)
    }

    const backAction = () => {
        exit()
        return true
    }

    useFocusEffect(() => {
        const handler = BackHandler.addEventListener('hardwareBackPress', backAction)
        return () => handler.remove()
    })

    const handleDeleteKV = () => {
        Alert.alert({
            title: t('model.alert.deletekv.title'),
            description: t('model.alert.deletekv.description', { size: readableFileSize(kvSize) }),
            buttons: [
                { label: t('common.actions.delete') },
                {
                    label: t('model.alert.deletekv.title'),
                    onPress: async () => {
                        await KV.deleteKV()
                        Logger.info(t('model.toast.deletekv'))
                        getKVSize()
                    },
                    type: 'warning',
                },
            ],
        })
    }

    const handleSaveProfile = () => {
        const name = newProfileName.trim()
        if (!name) return
        if (profiles[name]) {
            Alert.alert({
                title: 'Sobreescribir perfil',
                description: `¿Sobreescribir el perfil "${name}"?`,
                buttons: [
                    { label: 'Cancelar' },
                    {
                        label: 'Sobreescribir',
                        onPress: () => {
                            saveProfile(name)
                            setNewProfileName('')
                        },
                        type: 'warning',
                    },
                ],
            })
        } else {
            saveProfile(name)
            setNewProfileName('')
        }
    }

    const handleDeleteProfile = (name: string) => {
        Alert.alert({
            title: 'Eliminar perfil',
            description: `¿Eliminar el perfil "${name}"?`,
            buttons: [
                { label: 'Cancelar' },
                {
                    label: 'Eliminar',
                    onPress: () => deleteProfile(name),
                    type: 'warning',
                },
            ],
        })
    }

    const profileNames = Object.keys(profiles)
    const disabled = modelImporting || modelLoading

    return (
        <Animated.ScrollView
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            entering={SlideInRight.easing(Easing.inOut(Easing.cubic))}
            exiting={SlideOutRight.easing(Easing.inOut(Easing.cubic))}>

            {/* ── Perfiles ── */}
            <SectionTitle>Perfiles de Configuración</SectionTitle>
            <View style={{ marginTop: 8, gap: spacing.m }}>
                {/* Guardar perfil nuevo */}
                <View style={{ flexDirection: 'row', gap: spacing.m, alignItems: 'center' }}>
                    <TextInput
                        value={newProfileName}
                        onChangeText={setNewProfileName}
                        placeholder="Nombre del perfil..."
                        placeholderTextColor={color.text._600}
                        style={{
                            flex: 1,
                            color: color.text._100,
                            backgroundColor: color.neutral._200,
                            borderRadius: borderRadius.m,
                            paddingHorizontal: spacing.l,
                            paddingVertical: spacing.sm,
                            fontSize: fontSize.m,
                            borderWidth: 1,
                            borderColor: color.neutral._300,
                        }}
                    />
                    <ThemedButton
                        label="Guardar"
                        onPress={handleSaveProfile}
                        variant={newProfileName.trim() ? 'primary' : 'disabled'}
                        buttonStyle={{ paddingHorizontal: spacing.l }}
                    />
                </View>

                {/* Lista de perfiles guardados */}
                {profileNames.length === 0 && (
                    <Text style={{ color: color.text._500, fontSize: fontSize.s, marginLeft: 4 }}>
                        No hay perfiles guardados.
                    </Text>
                )}
                {profileNames.map((name) => (
                    <View
                        key={name}
                        style={{
                            backgroundColor: color.neutral._200,
                            borderRadius: borderRadius.m,
                            borderWidth: 1,
                            borderColor: color.neutral._300,
                            overflow: 'hidden',
                        }}>
                        {renamingProfile === name ? (
                            <View style={{ flexDirection: 'row', gap: spacing.m, padding: spacing.m, alignItems: 'center' }}>
                                <TextInput
                                    value={renameValue}
                                    onChangeText={setRenameValue}
                                    autoFocus
                                    style={{
                                        flex: 1,
                                        color: color.text._100,
                                        backgroundColor: color.neutral._300,
                                        borderRadius: borderRadius.s,
                                        paddingHorizontal: spacing.m,
                                        paddingVertical: spacing.sm,
                                        fontSize: fontSize.m,
                                    }}
                                />
                                <ThemedButton
                                    label="OK"
                                    onPress={() => {
                                        const n = renameValue.trim()
                                        if (n && n !== name) renameProfile(name, n)
                                        setRenamingProfile(null)
                                    }}
                                    variant="primary"
                                    buttonStyle={{ paddingHorizontal: spacing.m }}
                                />
                                <ThemedButton
                                    label="✕"
                                    onPress={() => setRenamingProfile(null)}
                                    variant="secondary"
                                    buttonStyle={{ paddingHorizontal: spacing.m }}
                                />
                            </View>
                        ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.m, gap: spacing.m }}>
                                <Text style={{ flex: 1, color: color.text._100, fontSize: fontSize.m, fontWeight: '600' }}>
                                    {name}
                                </Text>
                                <ThemedButton
                                    label="Cargar"
                                    onPress={() => loadProfile(name)}
                                    variant="secondary"
                                    buttonStyle={{ paddingHorizontal: spacing.m }}
                                />
                                <ThemedButton
                                    label="✎"
                                    onPress={() => {
                                        setRenamingProfile(name)
                                        setRenameValue(name)
                                    }}
                                    variant="secondary"
                                    buttonStyle={{ paddingHorizontal: spacing.m }}
                                />
                                <ThemedButton
                                    label="✕"
                                    onPress={() => handleDeleteProfile(name)}
                                    variant="critical"
                                    buttonStyle={{ paddingHorizontal: spacing.m }}
                                />
                            </View>
                        )}
                    </View>
                ))}
            </View>

            {/* ── CPU Settings ── */}
            <SectionTitle>{t('model.settings.cpu')}</SectionTitle>
            <View style={{ marginTop: 16 }} />
            {config && (
                <>
                    <ThemedSlider
                        label={t('model.maxcontext')}
                        value={config.context_length}
                        onValueChange={(value) => setConfig({ ...config, context_length: value })}
                        min={1024}
                        max={32768}
                        step={1024}
                        disabled={disabled}
                    />
                    <ThemedSlider
                        label={t('model.threads')}
                        value={config.threads}
                        onValueChange={(value) => setConfig({ ...config, threads: value })}
                        min={1}
                        max={threadCount ?? 8}
                        step={1}
                        disabled={disabled}
                    />
                    <ThemedSlider
                        label={t('model.batch')}
                        value={config.batch}
                        onValueChange={(value) => setConfig({ ...config, batch: value })}
                        min={16}
                        max={1024}
                        step={16}
                        disabled={disabled}
                    />
                    <ThemedSlider
                        label={t('model.ubatch')}
                        value={config.ubatch}
                        onValueChange={(value) => setConfig({ ...config, ubatch: value })}
                        min={16}
                        max={512}
                        step={16}
                        disabled={disabled}
                    />
                    <ThemedSwitch
                        label={t('model.usemmap')}
                        value={config.use_mmap}
                        onChangeValue={(value) => setConfig({ ...config, use_mmap: value })}
                        description={t('model.usemmapdesc')}
                    />
                    <ThemedSwitch
                        label={t('model.usemlock')}
                        value={config.use_mlock}
                        onChangeValue={(value) => setConfig({ ...config, use_mlock: value })}
                        description={t('model.usemlockdesc')}
                    />

                    {/* ── GPU / Backend ── */}
                    <SectionTitle>{t('model.settings.gpu')}</SectionTitle>
                    <View style={{ marginTop: 8 }} />
                    <ThemedSlider
                        label={t('model.gpulayers')}
                        value={config.gpu_layers}
                        onValueChange={(value) => setConfig({ ...config, gpu_layers: value })}
                        min={0}
                        max={1000}
                        step={1}
                        disabled={disabled}
                    />

                    {/* Selector de backend GPU — muestra todos los disponibles */}
                    {devices.length > 0 && (
                        <>
                            <HorizontalSelector
                                style={{ paddingBottom: 8 }}
                                label="Backend GPU"
                                values={[
                                    { label: 'Auto', value: '' },
                                    ...devices
                                        .filter((d) => d !== 'CPU')
                                        .map((item) => ({
                                            label: deviceLabels[item] ?? item,
                                            value: item,
                                        })),
                                ]}
                                selected={
                                    config.devices?.find((d) => d !== 'CPU') ?? ''
                                }
                                onPress={(value) => {
                                    if (value === '') {
                                        setConfig({ ...config, devices: [] })
                                    } else {
                                        // GPU seleccionada + CPU para KV cache (híbrido)
                                        setConfig({
                                            ...config,
                                            devices: config.no_kv_offload ? [value, 'CPU'] : [value],
                                        })
                                    }
                                }}
                            />
                            <Text style={{
                                color: color.text._500,
                                fontSize: fontSize.s,
                                marginLeft: 4,
                                marginBottom: 8,
                            }}>
                                {devices.filter(d => d !== 'CPU').join(' · ') || 'Sin GPU detectada'}
                            </Text>
                        </>
                    )}

                    {/* Modo híbrido: GPU matmul + CPU KV cache */}
                    <ThemedSwitch
                        label={t('model.nokvoffload')}
                        value={config.no_kv_offload}
                        onChangeValue={(value) => {
                            const gpuDevice = config.devices?.find((d) => d !== 'CPU')
                            // Al activar híbrido, asegurar que CPU está en devices si hay GPU
                            const newDevices = value && gpuDevice
                                ? [gpuDevice, 'CPU']
                                : gpuDevice
                                  ? [gpuDevice]
                                  : config.devices
                            setConfig({ ...config, no_kv_offload: value, devices: newDevices })
                        }}
                        description={t('model.nokvoffloaddesc')}
                    />
                    <ThemedSwitch
                        label={t('model.forcegpu')}
                        value={config.force_gpu_device}
                        onChangeValue={(value) => setConfig({ ...config, force_gpu_device: value })}
                    />

                    {/* ── Math & Precision ── */}
                    <SectionTitle>{t('model.settings.math')}</SectionTitle>
                    <View style={{ marginTop: 8 }} />
                    <HorizontalSelector
                        style={{ paddingBottom: 12 }}
                        label={t('model.cachetyepk')}
                        values={KV_CACHE_TYPES.map((v) => ({ label: v, value: v }))}
                        selected={config.cache_type_k}
                        onPress={(value) => setConfig({ ...config, cache_type_k: value })}
                    />
                    <HorizontalSelector
                        style={{ paddingBottom: 12 }}
                        label={t('model.cachetypev')}
                        values={KV_CACHE_TYPES.map((v) => ({ label: v, value: v }))}
                        selected={config.cache_type_v}
                        onPress={(value) => setConfig({ ...config, cache_type_v: value })}
                    />
                    <HorizontalSelector
                        style={{ paddingBottom: 12 }}
                        label={t('model.flashattn')}
                        values={[
                            { label: 'off', value: 'off' },
                            { label: 'auto', value: 'auto' },
                        ]}
                        selected={config.flash_attn ? 'auto' : 'off'}
                        onPress={(value) => setConfig({ ...config, flash_attn: value === 'auto' })}
                    />
                    <ThemedSwitch
                        label={t('model.kvunified')}
                        value={config.kv_unified}
                        onChangeValue={(value) => setConfig({ ...config, kv_unified: value })}
                    />

                    {/* ── Context Management ── */}
                    <SectionTitle>{t('model.settings.context')}</SectionTitle>
                    <View style={{ marginTop: 8 }} />
                    <ThemedSwitch
                        label={t('model.contextshift')}
                        value={config.ctx_shift}
                        onChangeValue={(value) => setConfig({ ...config, ctx_shift: value })}
                    />
                    <ThemedSwitch
                        label={t('model.swafull')}
                        value={config.swa_full}
                        onChangeValue={(value) => setConfig({ ...config, swa_full: value })}
                        description={t('model.swafulldesc')}
                    />
                    <ThemedSlider
                        label={t('model.nkeep')}
                        value={config.n_keep}
                        onValueChange={(value) => setConfig({ ...config, n_keep: value })}
                        min={0}
                        max={1024}
                        step={32}
                        disabled={disabled}
                    />
                    {/* defrag_thold — rango continuo 0.0 a 1.0 */}
                    <ThemedSlider
                        label={t('model.defragthold')}
                        value={config.defrag_thold}
                        onValueChange={(value) =>
                            setConfig({ ...config, defrag_thold: Math.round(value * 100) / 100 })
                        }
                        min={0}
                        max={1}
                        step={0.01}
                        disabled={disabled}
                    />
                </>
            )}

            {/* ── Advanced Settings ── */}
            <SectionTitle>{t('model.settings.advanced')}</SectionTitle>
            <ThemedSwitch
                label={t('model.cacheprompt')}
                value={cachePrompt ?? true}
                onChangeValue={setCachePrompt}
                description={t('model.cachepromptdesc')}
            />
            <ThemedSwitch
                label={t('model.disablelogs')}
                value={disableLogs ?? true}
                onChangeValue={setDisableLogs}
                description={t('model.disablelogsdesc')}
            />
            <ThemedSwitch
                label={t('model.modelnamechat')}
                value={showModelInChat ?? false}
                onChangeValue={setShowModelInChat}
            />
            <ThemedSwitch
                label={t('model.autoload')}
                value={autoloadLocal ?? false}
                onChangeValue={setAutoloadLocal}
            />
            <ThemedSwitch
                label={t('model.savekv')}
                value={saveKV}
                onChangeValue={setSaveKV}
                description={saveKV ? '' : t('model.savekvdesc')}
            />
            {saveKV && (
                <ThemedButton
                    buttonStyle={{ marginTop: 8 }}
                    label={t('model.purgekv', { size: readableFileSize(kvSize) })}
                    onPress={handleDeleteKV}
                    variant={kvSize === 0 ? 'disabled' : 'critical'}
                />
            )}

            {/* ── Context Summarizer ── */}
            <SectionTitle>{t('model.settings.summarizer')}</SectionTitle>
            <ThemedSwitch
                label={t('model.summarize')}
                value={summarizeContext ?? false}
                onChangeValue={setSummarizeContext}
                description={t('model.summarizedesc')}
            />
            {summarizeContext && (
                <>
                    <ThemedSlider
                        label={t('model.summarizeTrigger')}
                        value={summaryTrigger ?? 75}
                        onValueChange={setSummaryTrigger}
                        min={50}
                        max={95}
                        step={5}
                        disabled={disabled}
                    />
                    <ThemedSlider
                        label={t('model.summarizeRecent')}
                        value={summaryRecent ?? 8}
                        onValueChange={setSummaryRecent}
                        min={4}
                        max={20}
                        step={2}
                        disabled={disabled}
                    />
                </>
            )}
        </Animated.ScrollView>
    )
}

export default ModelSettings
