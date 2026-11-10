import Octicons from '@react-native-vector-icons/octicons/static'
import { setBackgroundColorAsync } from 'expo-system-ui'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Linking, Text, TouchableOpacity, useColorScheme, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useShallow } from 'zustand/react/shallow'

import ThemedButton from '@components/buttons/ThemedButton'
import ThemedSwitch from '@components/input/ThemedSwitch'
import Alert from '@components/views/Alert'
import { useBottomSheetRef } from '@components/views/BottomSheet'
import ContextMenu from '@components/views/ContextMenu'
import HeaderButton from '@components/views/HeaderButton'
import HeaderTitle from '@components/views/HeaderTitle'
import InputSheet from '@components/views/InputSheet'
import { Logger } from '@lib/state/Logger'
import { isValidSeed, MATERIAL_YOU_SEEDS, materialYouNames, seedLabel } from '@lib/theme/MaterialYou'
import { DefaultColorSchemes, ThemeColor } from '@lib/theme/ThemeColor'
import { Theme } from '@lib/theme/ThemeManager'
import { pickJSONDocument } from '@lib/utils/File'

type ColorThemeItemProps = {
    item: ThemeColor
    index: number
    showDelete?: boolean
}

const ColorThemeItem: React.FC<ColorThemeItemProps> = ({ item, index, showDelete = false }) => {
    const { t } = useTranslation()
    const {
        systemDark,
        removeColorScheme,
        color,
        darkColor,
        lightColor,
        setColor,
        setLightColor,
        setDarkColor,
    } = Theme.useColorState(
        useShallow((state) => ({
            systemDark: state.useSystemDarkMode,
            color: state.color,
            lightColor: state.lightColor,
            darkColor: state.darkColor,
            setColor: state.setColor,
            setLightColor: state.setLightColor,
            setDarkColor: state.setDarkColor,
            removeColorScheme: state.removeColorScheme,
        }))
    )
    const { borderRadius } = Theme.useTheme()
    const systemTheme = useColorScheme()
    const activeColor = systemDark ? (systemTheme === 'dark' ? darkColor : lightColor) : color

    const handleRemoveColorScheme = (index: number) => {
        Alert.alert({
            title: t('settings.colors.alert.deleteTheme.title'),
            description: t('settings.colors.alert.deleteTheme.description', {
                name: item.name,
            }),
            buttons: [
                { label: t('common.actions.cancel') },
                {
                    label: t('settings.colors.alert.deleteTheme.confirm'),
                    type: 'warning',
                    onPress: () => {
                        removeColorScheme(index)
                    },
                },
            ],
        })
    }

    return (
        <View
            style={{
                flexDirection: 'row',
                columnGap: 4,
                alignItems: 'stretch',
            }}>
            <TouchableOpacity
                disabled={systemDark}
                onPress={() => {
                    setColor(item)
                    setBackgroundColorAsync(item.neutral._100)
                }}
                style={{
                    borderColor: item.text._100,
                    borderWidth: 1,
                    backgroundColor: item.neutral._100,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: borderRadius.xl,
                    columnGap: 8,
                    flex: 1,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                }}
                key={index}>
                <View
                    style={{
                        alignItems: 'center',
                        columnGap: 16,
                        flexDirection: 'row',
                        marginRight: 16,
                        flex: 1,
                    }}>
                    <View
                        style={{
                            padding: 8,
                            backgroundColor: item.primary._500,
                            borderRadius: borderRadius.full,
                        }}
                    />
                    <Text style={{ color: item.text._100, flex: 1 }} ellipsizeMode="tail">
                        {item.name}
                    </Text>
                    {!systemDark && item.name === color.name && (
                        <Text
                            style={{
                                color: item.text._100,
                                borderColor: item.neutral._300,
                                borderWidth: 2,
                                paddingHorizontal: 8,
                                borderRadius: borderRadius.full,
                            }}>
                            {t('settings.colors.active')}
                        </Text>
                    )}
                </View>
                {showDelete ? (
                    <ThemedButton
                        iconStyle={{ color: item.error._500 }}
                        variant="tertiary"
                        iconSize={20}
                        iconName="delete"
                        onPress={() => {
                            handleRemoveColorScheme(index)
                        }}
                    />
                ) : (
                    <Text style={{ color: item.text._500 }}>
                        {showDelete ? t('settings.colors.custom') : t('settings.colors.builtIn')}
                    </Text>
                )}
            </TouchableOpacity>
            {systemDark && (
                <>
                    <TouchableOpacity
                        style={{
                            borderColor: activeColor.text._100,
                            borderWidth: 1,
                            backgroundColor: activeColor.neutral._100,
                            paddingHorizontal: 12,
                            borderRadius: borderRadius.xl,
                            justifyContent: 'center',
                        }}
                        onPress={() => {
                            setLightColor(item)
                            if (systemTheme === 'light') setBackgroundColorAsync(item.neutral._100)
                        }}>
                        <Octicons
                            color={
                                item.name === lightColor.name
                                    ? activeColor.text._100
                                    : activeColor.text._700
                            }
                            name="sun"
                            size={17}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={{
                            borderColor: activeColor.text._100,
                            borderWidth: 1,
                            backgroundColor: activeColor.neutral._100,
                            paddingHorizontal: 12,
                            borderRadius: borderRadius.xl,
                            justifyContent: 'center',
                        }}
                        onPress={() => {
                            setDarkColor(item)
                            if (systemTheme === 'light') setBackgroundColorAsync(item.neutral._100)
                        }}>
                        <Octicons
                            color={
                                item.name === darkColor.name
                                    ? activeColor.text._100
                                    : activeColor.text._700
                            }
                            name="moon"
                            size={18}
                        />
                    </TouchableOpacity>
                </>
            )}
        </View>
    )
}

const SWATCH_SIZE = 44

const MaterialYouPicker: React.FC = () => {
    const { t } = useTranslation()
    const { color, spacing, borderRadius, fontSize } = Theme.useTheme()
    const systemTheme = useColorScheme()
    const { darkColor, applyMaterialYou } = Theme.useColorState(
        useShallow((state) => ({
            darkColor: state.darkColor,
            applyMaterialYou: state.applyMaterialYou,
        }))
    )
    const inputRef = useBottomSheetRef()

    const apply = (seed: string) => {
        applyMaterialYou(seed)
        const state = Theme.useColorState.getState()
        const active = state.useSystemDarkMode
            ? systemTheme === 'dark'
                ? state.darkColor
                : state.lightColor
            : state.color
        setBackgroundColorAsync(active.neutral._100)
    }

    const handleCustomSeed = (text: string) => {
        if (!isValidSeed(text)) {
            Logger.errorToast(t('settings.colors.materialYou.invalid'))
            return
        }
        apply(seedLabel(text))
    }

    return (
        <View style={{ rowGap: spacing.m, paddingBottom: spacing.xl }}>
            <Text style={{ color: color.text._100, fontSize: fontSize.l, fontWeight: '600' }}>
                {t('settings.colors.materialYou.title')}
            </Text>
            <Text style={{ color: color.text._400, fontSize: fontSize.m }}>
                {t('settings.colors.materialYou.description')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.l }}>
                {MATERIAL_YOU_SEEDS.map((seed) => {
                    const selected = materialYouNames(seed.hex).dark === darkColor.name
                    return (
                        <TouchableOpacity
                            key={seed.hex}
                            accessibilityLabel={seed.name}
                            onPress={() => apply(seed.hex)}
                            style={{
                                width: SWATCH_SIZE,
                                height: SWATCH_SIZE,
                                borderRadius: borderRadius.full,
                                borderWidth: selected ? 3 : 0,
                                borderColor: color.text._100,
                                padding: selected ? 3 : 0,
                            }}>
                            <View
                                style={{
                                    flex: 1,
                                    borderRadius: borderRadius.full,
                                    backgroundColor: seed.hex,
                                }}
                            />
                        </TouchableOpacity>
                    )
                })}
                <TouchableOpacity
                    onPress={() => inputRef.current?.open()}
                    style={{
                        height: SWATCH_SIZE,
                        paddingHorizontal: spacing.xl,
                        borderRadius: borderRadius.full,
                        backgroundColor: color.neutral._300,
                        justifyContent: 'center',
                    }}>
                    <Text style={{ color: color.text._100 }}>
                        {t('settings.colors.materialYou.other')}
                    </Text>
                </TouchableOpacity>
            </View>
            <InputSheet
                ref={inputRef}
                onConfirm={handleCustomSeed}
                title={t('settings.colors.materialYou.otherTitle')}
                placeholder="#6750A4"
            />
        </View>
    )
}

const ColorSelector = () => {
    const { t } = useTranslation()
    const { systemDark, setSystemDark, customColors, addCustomColor } = Theme.useColorState(
        useShallow((state) => ({
            // system
            systemDark: state.useSystemDarkMode,
            setSystemDark: state.setUseSystemDarkMode,
            // custom color
            customColors: state.customColors,
            addCustomColor: state.addCustomColor,
        }))
    )

    const inputRef = useBottomSheetRef()

    return (
        <SafeAreaView edges={['bottom']} style={{ paddingHorizontal: 16, rowGap: 16, flex: 1 }}>
            <HeaderTitle title={t('settings.colors.title')} />
            <ThemedSwitch
                value={systemDark}
                onChangeValue={setSystemDark}
                label={t('settings.colors.useSystemDarkMode')}
            />
            <HeaderButton
                headerRight={() => (
                    <ContextMenu
                        triggerIcon="setting"
                        placement="bottom"
                        buttons={[
                            {
                                label: t('settings.colors.contextMenu.importTheme'),
                                icon: 'download',
                                onPress: (close) => {
                                    pickJSONDocument().then((result) => {
                                        if (!result.success) return
                                        addCustomColor(result.data)
                                    })
                                    close()
                                },
                            },
                            {
                                label: t('settings.colors.contextMenu.pasteTheme'),
                                icon: 'file',
                                onPress: (close) => {
                                    close()
                                    inputRef.current?.open()
                                },
                            },
                            {
                                label: t('settings.colors.contextMenu.getThemes'),
                                icon: 'github',
                                onPress: (close) => {
                                    close()
                                    Linking.openURL(
                                        'https://github.com/Vali-98/ChatterUI/discussions/218'
                                    )
                                },
                            },
                        ]}
                    />
                )}
            />
            <InputSheet
                ref={inputRef}
                onConfirm={(e) => {
                    try {
                        const data = JSON.parse(e)
                        addCustomColor(data)
                    } catch (e) {
                        Logger.errorToast(
                            t('settings.colors.error.failedToImport', {
                                error: `${e}`,
                            })
                        )
                    }
                }}
                multiline
                title={t('settings.colors.pasteThemeTitle')}
            />

            <FlatList
                style={{ flex: 1 }}
                contentContainerStyle={{ rowGap: 8 }}
                ListHeaderComponent={<MaterialYouPicker />}
                data={[...DefaultColorSchemes.schemes, ...customColors]}
                keyExtractor={(item) => item.name}
                renderItem={({ item, index }) => (
                    <ColorThemeItem
                        item={item}
                        index={index - DefaultColorSchemes.schemes.length}
                        showDelete={index >= DefaultColorSchemes.schemes.length}
                    />
                )}
            />
        </SafeAreaView>
    )
}

export default ColorSelector
