import { useFocusEffect } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, View } from 'react-native'
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
    const { config, setConfig } = Llama.useLlamaPreferencesStore(
        useShallow((state) => ({
            config: state.config,
            setConfig: state.setConfiguration,
        }))
    )

    const devices = useBackendDevices()

    const [saveKV, setSaveKV] = useMMKVBoolean(AppSettings.SaveLocalKV)
    const [autoloadLocal, setAutoloadLocal] = useMMKVBoolean(AppSettings.AutoLoadLocal)
    const [showModelInChat, setShowModelInChat] = useMMKVBoolean(AppSettings.ShowModelInChat)
    const [disableLogs, setDisableLogs] = useMMKVBoolean(AppSettings.DisableLogs)
    const [cachePrompt, setCachePrompt] = useMMKVBoolean(AppSettings.CachePrompt)
    const [threadCount] = useMMKVNumber(Global.CPUThreads)

    const [kvSize, setKVSize] = useState(0)

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

    const disabled = modelImporting || modelLoading

    return (
        <Animated.ScrollView
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            entering={SlideInRight.easing(Easing.inOut(Easing.cubic))}
            exiting={SlideOutRight.easing(Easing.inOut(Easing.cubic))}>

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
                    <ThemedSwitch
                        label={t('model.forcegpu')}
                        value={config.force_gpu_device}
                        onChangeValue={(value) => setConfig({ ...config, force_gpu_device: value })}
                    />
                    <ThemedSwitch
                        label={t('model.nokvoffload')}
                        value={config.no_kv_offload}
                        onChangeValue={(value) => setConfig({ ...config, no_kv_offload: value })}
                        description={t('model.nokvoffloaddesc')}
                    />
                    {devices.length > 1 && (
                        <HorizontalSelector
                            style={{ paddingBottom: 12 }}
                            label={t('model.devicepreset')}
                            values={devices.map((item) => ({
                                label: deviceLabels[item] ?? item,
                                value: item,
                            }))}
                            selected={config.devices?.[0]}
                            onPress={(value) => {
                                const selected = value === 'CPU' ? [value] : [value, 'CPU']
                                setConfig({ ...config, devices: selected })
                            }}
                        />
                    )}

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
                    <ThemedSlider
                        label={t('model.defragthold')}
                        value={config.defrag_thold}
                        onValueChange={(value) => setConfig({ ...config, defrag_thold: value })}
                        min={0.01}
                        max={1.0}
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
        </Animated.ScrollView>
    )
}

export default ModelSettings
