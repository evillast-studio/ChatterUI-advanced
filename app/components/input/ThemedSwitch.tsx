import React, { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
    interpolate,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated'

import { Theme } from '@lib/theme/ThemeManager'

interface ThemedSwitchProps {
    description?: string
    label?: string
    value: boolean | undefined
    onChangeValue: (b: boolean) => void
}

// Medidas del interruptor (Material 3, más grande que el nativo de Android).
// El borde de 2 px forma parte del tamaño total; el tirador se coloca dentro del borde.
const TRACK_WIDTH = 60
const TRACK_HEIGHT = 36
const BORDER_WIDTH = 2
const INNER_WIDTH = TRACK_WIDTH - BORDER_WIDTH * 2
const INNER_HEIGHT = TRACK_HEIGHT - BORDER_WIDTH * 2
const THUMB_OFF = 20
const THUMB_ON = 26
/** Distancia del centro del tirador al borde de la pista. */
const THUMB_INSET = 16

const ThemedSwitch: React.FC<ThemedSwitchProps> = ({
    description,
    label,
    value,
    onChangeValue,
}) => {
    const { color, spacing, borderRadius } = Theme.useTheme()
    const progress = useSharedValue(value ? 1 : 0)

    useEffect(() => {
        progress.value = withTiming(value ? 1 : 0, { duration: 180 })
    }, [value, progress])

    const trackStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            progress.value,
            [0, 1],
            [color.neutral._300, color.primary._500]
        ),
        borderColor: interpolateColor(
            progress.value,
            [0, 1],
            [color.neutral._500, color.primary._500]
        ),
    }))

    const thumbStyle = useAnimatedStyle(() => {
        const size = interpolate(progress.value, [0, 1], [THUMB_OFF, THUMB_ON])
        const centerX = interpolate(
            progress.value,
            [0, 1],
            [THUMB_INSET, INNER_WIDTH - THUMB_INSET]
        )
        return {
            width: size,
            height: size,
            left: centerX - size / 2,
            top: (INNER_HEIGHT - size) / 2,
            backgroundColor: interpolateColor(
                progress.value,
                [0, 1],
                [color.neutral._500, color.text._900]
            ),
        }
    })

    return (
        <View>
            <View
                style={{ flexDirection: 'row', paddingVertical: spacing.m, alignItems: 'center' }}>
                <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: !!value }}
                    hitSlop={8}
                    onPress={() => onChangeValue(!value)}>
                    <Animated.View
                        style={[
                            {
                                width: TRACK_WIDTH,
                                height: TRACK_HEIGHT,
                                borderRadius: borderRadius.full,
                                borderWidth: BORDER_WIDTH,
                            },
                            trackStyle,
                        ]}>
                        <Animated.View
                            style={[{ position: 'absolute', borderRadius: borderRadius.full }, thumbStyle]}
                        />
                    </Animated.View>
                </Pressable>
                {label && (
                    <Text
                        style={{
                            flex: 1,
                            marginLeft: spacing.xl,
                            color: value ? color.text._100 : color.text._300,
                        }}>
                        {label}
                    </Text>
                )}
            </View>
            {description && (
                <Text
                    style={{
                        color: color.text._400,
                        paddingBottom: spacing.xs,
                        marginBottom: spacing.m,
                    }}>
                    {description}
                </Text>
            )}
        </View>
    )
}

export default ThemedSwitch
