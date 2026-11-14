import { t } from 'i18next'
import { useMemo } from 'react'
import { Appearance, useColorScheme } from 'react-native'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'

import { Storage } from '@lib/enums/Storage'
import { Logger } from '@lib/state/Logger'
import { createMMKVStorage } from '@lib/storage/MMKV'

import { materialYouSchemes } from './MaterialYou'
import { DefaultColorSchemes, ThemeColor, themeColorSchemaV1 } from './ThemeColor'

interface ColorStateProps {
    useSystemDarkMode: boolean
    setUseSystemDarkMode: (b: boolean) => void
    customColors: ThemeColor[]
    addCustomColor: (colorScheme: ThemeColor) => void
    removeColorScheme: (index: number) => void
    /** Genera los esquemas Material You (oscuro y claro) de un color base y los aplica. */
    applyMaterialYou: (seed: string) => void
    color: ThemeColor
    lightColor: ThemeColor
    darkColor: ThemeColor
    setColor: (colorScheme: ThemeColor) => void
    setLightColor: (colorScheme: ThemeColor) => void
    setDarkColor: (colorScheme: ThemeColor) => void
}

export namespace Theme {
    export const useColorState = create<ColorStateProps>()(
        persist(
            (set, get) => ({
                useSystemDarkMode: true,
                color: DefaultColorSchemes.materialYouDark,
                darkColor: DefaultColorSchemes.materialYouDark,
                lightColor: DefaultColorSchemes.materialYouLight,
                setColor: (color) => {
                    set({ color: color })
                },
                setLightColor: (color) => {
                    set({ lightColor: color })
                },
                setDarkColor: (color) => {
                    set({ darkColor: color })
                },
                setUseSystemDarkMode: (b) => {
                    set({ useSystemDarkMode: b })
                },

                customColors: [],
                addCustomColor: (colorScheme: ThemeColor) => {
                    const validation = themeColorSchemaV1.safeParse(colorScheme)

                    if (!validation.success) {
                        Logger.errorToast(t('common.errors.schemaValidationFailed'))
                        Logger.error(
                            'The format of the imported JSON does not match the required color scheme:\n' +
                                validation.error.issues
                                    .map((issue) => `${issue.path.join('.')} - ${issue.message}`)
                                    .join('\n')
                        )
                        return
                    }

                    if (
                        get().customColors.some((item) => item.name === colorScheme.name) ||
                        DefaultColorSchemes.schemes.some((item) => item.name === colorScheme.name)
                    ) {
                        Logger.errorToast(t('settings.colors.error.colorNameAlreadyUsed'))
                        return
                    }
                    set({ customColors: [...get().customColors, colorScheme] })
                    Logger.info(`Successfully imported ${colorScheme.name}`)
                },
                removeColorScheme: (index: number) => {
                    if (index > get().customColors.length) {
                        return
                    }
                    const colors = [...get().customColors]
                    const removedArr = colors.splice(index, 1)
                    const removed = removedArr?.[0]
                    let color = get().color
                    let lightColor = get().lightColor
                    let darkColor = get().darkColor
                    if (removed) {
                        if (removed.name === color.name) color = DefaultColorSchemes.materialYouDark
                        if (removed.name === lightColor.name)
                            lightColor = DefaultColorSchemes.materialYouLight
                        if (removed.name === darkColor.name)
                            darkColor = DefaultColorSchemes.materialYouDark
                    }
                    set({
                        customColors: colors,
                        color: color,
                        lightColor: lightColor,
                        darkColor: darkColor,
                    })
                },
                applyMaterialYou: (seed: string) => {
                    const { dark, light } = materialYouSchemes(seed)
                    const known = (scheme: ThemeColor) =>
                        DefaultColorSchemes.schemes.find((item) => item.name === scheme.name) ??
                        get().customColors.find((item) => item.name === scheme.name)
                    const customColors = [...get().customColors]
                    // Los esquemas del color base estándar ya vienen incluidos; los demás se guardan
                    for (const scheme of [dark, light]) {
                        if (!known(scheme)) customColors.push(scheme)
                    }
                    const pick = (scheme: ThemeColor) => known(scheme) ?? scheme
                    const systemIsLight = Appearance.getColorScheme() === 'light'
                    set({
                        customColors,
                        darkColor: pick(dark),
                        lightColor: pick(light),
                        color: pick(systemIsLight ? light : dark),
                    })
                },
            }),
            {
                name: Storage.ColorState,
                storage: createMMKVStorage(),
                version: 3,
                partialize: (state) => ({
                    color: state.color,
                    customColors: state.customColors,
                    darkColor: state.darkColor,
                    lightColor: state.lightColor,
                    useSystemDarkMode: state.useSystemDarkMode,
                }),
                migrate: (persistedState: any, version) => {
                    if (version === 1) {
                        persistedState.darkColor = DefaultColorSchemes.lavenderDark
                        persistedState.lightColor = DefaultColorSchemes.lavenderLight
                        persistedState.useSystemDarkMode = false
                    }
                    if (version < 3) {
                        // Los esquemas por defecto pasan a ser Material You; los elegidos por el
                        // usuario (AMOLED, Navy, personalizados…) no se tocan.
                        const upgrade = (scheme?: ThemeColor) => {
                            if (scheme?.name === DefaultColorSchemes.lavenderDark.name)
                                return DefaultColorSchemes.materialYouDark
                            if (scheme?.name === DefaultColorSchemes.lavenderLight.name)
                                return DefaultColorSchemes.materialYouLight
                            return scheme
                        }
                        persistedState.color = upgrade(persistedState.color)
                        persistedState.darkColor = upgrade(persistedState.darkColor)
                        persistedState.lightColor = upgrade(persistedState.lightColor)
                    }
                    return persistedState
                },
            }
        )
    )
    // TODO: State-ify
    const spacing = {
        xs: 2,
        s: 4,
        sm: 6,
        m: 8,
        l: 12,
        xl: 16,
        xl2: 24,
        xl3: 32,
    }

    const borderWidth = {
        s: 1,
        m: 2,
        l: 4,
        xl: 8,
    }

    const borderRadius = {
        s: 4,
        m: 8,
        l: 12,
        xl: 16,
        xl2: 24,
        xl3: 32,
        /** Forma de pastilla de Material 3 (botones, chips, selectores). */
        full: 999,
    }

    const fontSize = { s: 12, m: 14, l: 16, xl: 18, xl2: 20, xl3: 24 }

    const font = ''

    export const useTheme = () => {
        const systemTheme = useColorScheme()
        const { selectedColor, useSystemDarkMode, lightColor, darkColor } = useColorState(
            useShallow((state) => ({
                selectedColor: state.color,
                useSystemDarkMode: state.useSystemDarkMode,
                lightColor: state.lightColor,
                darkColor: state.darkColor,
            }))
        )

        const color = useSystemDarkMode
            ? systemTheme === 'dark'
                ? darkColor
                : lightColor
            : selectedColor

        return useMemo(
            () => ({ color, spacing, font, borderWidth, fontSize, borderRadius }),
            [color]
        )
    }
}
