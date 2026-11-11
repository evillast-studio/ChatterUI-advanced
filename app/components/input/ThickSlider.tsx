import { useRef, useState } from 'react'
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'

import { Theme } from '@lib/theme/ThemeManager'

const TRACK_HEIGHT = 16
const HANDLE_WIDTH = 5
const HANDLE_HEIGHT = 40
/** Separación entre el tirador y las dos partes de la barra. */
const GAP = 6

type ThickSliderProps = {
    value: number
    min: number
    max: number
    /** 0 = continuo */
    step?: number
    disabled?: boolean
    /** Se llama al soltar el tirador o al tocar la barra, como el slider nativo anterior. */
    onSlidingComplete: (value: number) => void
    style?: StyleProp<ViewStyle>
}

/**
 * Slider de barra gruesa (Material 3 expresivo): dos barras redondeadas separadas por un
 * tirador vertical. Reemplaza al slider nativo de Android, cuyo grosor no se puede cambiar.
 */
const ThickSlider: React.FC<ThickSliderProps> = ({
    value,
    min,
    max,
    step = 0,
    disabled = false,
    onSlidingComplete,
    style,
}) => {
    const { color, borderRadius } = Theme.useTheme()
    const [width, setWidth] = useState(0)
    // Valor mientras se arrastra; undefined = se muestra el valor recibido
    const [dragValue, setDragValue] = useState<number | undefined>(undefined)
    const latest = useRef(value)

    const range = max - min
    const shown = dragValue ?? value
    const fraction = range > 0 ? Math.min(1, Math.max(0, (shown - min) / range)) : 0
    // El tirador nunca se sale de la barra
    const handleX = Math.min(width - HANDLE_WIDTH / 2, Math.max(HANDLE_WIDTH / 2, fraction * width))

    const valueAt = (x: number) => {
        if (width <= 0 || range <= 0) return min
        const raw = min + Math.min(1, Math.max(0, x / width)) * range
        const snapped = step > 0 ? Math.round((raw - min) / step) * step + min : raw
        return Math.min(max, Math.max(min, snapped))
    }

    const update = (x: number) => {
        const next = valueAt(x)
        latest.current = next
        setDragValue(next)
    }

    const finish = () => {
        onSlidingComplete(latest.current)
        setDragValue(undefined)
    }

    const pan = Gesture.Pan()
        .runOnJS(true)
        .enabled(!disabled)
        .activeOffsetX([-6, 6])
        .failOffsetY([-12, 12])
        .onStart((event) => update(event.x))
        .onUpdate((event) => update(event.x))
        .onEnd(finish)

    const tap = Gesture.Tap()
        .runOnJS(true)
        .enabled(!disabled)
        .onEnd((event, success) => {
            if (!success) return
            update(event.x)
            finish()
        })

    const activeColor = disabled ? color.neutral._500 : color.primary._500
    const inactiveColor = disabled ? color.neutral._300 : color.primary._300
    const leftWidth = Math.max(0, handleX - HANDLE_WIDTH / 2 - GAP)
    const rightLeft = handleX + HANDLE_WIDTH / 2 + GAP

    return (
        <GestureDetector gesture={Gesture.Race(pan, tap)}>
            <View
                accessible
                accessibilityRole="adjustable"
                accessibilityValue={{ min, max, now: shown }}
                onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
                style={[{ height: HANDLE_HEIGHT + 4, justifyContent: 'center' }, style]}>
                <View
                    style={{
                        position: 'absolute',
                        left: 0,
                        width: leftWidth,
                        height: TRACK_HEIGHT,
                        borderRadius: borderRadius.full,
                        backgroundColor: activeColor,
                    }}
                />
                <View
                    style={{
                        position: 'absolute',
                        left: rightLeft,
                        right: 0,
                        height: TRACK_HEIGHT,
                        borderRadius: borderRadius.full,
                        backgroundColor: inactiveColor,
                    }}
                />
                <View
                    style={{
                        position: 'absolute',
                        left: handleX - HANDLE_WIDTH / 2,
                        width: HANDLE_WIDTH,
                        height: HANDLE_HEIGHT,
                        borderRadius: borderRadius.full,
                        backgroundColor: activeColor,
                    }}
                />
            </View>
        </GestureDetector>
    )
}

export default ThickSlider
