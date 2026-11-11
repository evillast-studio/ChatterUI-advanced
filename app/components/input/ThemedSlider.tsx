import { useCallback, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'

import { Theme } from '@lib/theme/ThemeManager'

import ThickSlider from './ThickSlider'

type ThemedSliderProps = {
    label: string
    value: number
    onValueChange: (value: number) => void
    min?: number
    max?: number
    step?: number
    precision?: number
    showInput?: boolean
    disabled?: boolean
}

const clamp = (val: number, min: number, max: number, precision: number) =>
    Math.min(Math.max(parseFloat(val?.toFixed(precision) ?? 0), min), max)

const ThemedSlider: React.FC<ThemedSliderProps> = ({
    label,
    value,
    onValueChange,
    min = 0,
    max = 1,
    step = 0,
    precision,
    showInput = true,
    disabled = false,
}) => {
    const resolvedPrecision =
        precision !== undefined
            ? precision
            : step > 0 && step < 1
              ? Math.max(0, -Math.floor(Math.log10(step)))
              : 0
    const styles = useStyles()
    const { color } = Theme.useTheme()
    const [textValue, setTextValue] = useState(value.toString())

    const clampSlider = useCallback(
        (value: number) => clamp(value, min, max, resolvedPrecision),
        [min, max, resolvedPrecision]
    )

    const handleSliderChange = (v: number) => {
        if (!isNaN(clampSlider(v))) onValueChange(clampSlider(v))
        setTextValue(clampSlider(v).toString())
    }

    const handleTextInputChange = (t: string) => {
        let v = 0
        setTextValue(t)
        v = parseFloat(t)
        if (!isNaN(v)) onValueChange(clampSlider(v))
    }

    const handleEndEdit = () => {
        const v = parseFloat(textValue)
        if (!isNaN(v)) onValueChange(clamp(v, min, max, resolvedPrecision))
        setTextValue(clampSlider(value).toString())
    }

    return (
        <View style={{ alignItems: `center` }}>
            {label && (
                <Text style={disabled ? styles.itemNameDisabled : styles.itemName}>{label}</Text>
            )}
            <View style={styles.sliderContainer}>
                <ThickSlider
                    disabled={disabled}
                    style={styles.slider}
                    step={step}
                    min={min}
                    max={max}
                    value={value}
                    onSlidingComplete={handleSliderChange}
                />
                {showInput && (
                    <TextInput
                        editable={!disabled}
                        style={[
                            styles.textBox,
                            {
                                flex: value > 999999 ? 2 : 1.5,
                                borderColor: disabled ? color.neutral._700 : color.neutral._400,
                            },
                        ]}
                        value={textValue}
                        onChangeText={handleTextInputChange}
                        keyboardType="decimal-pad"
                        submitBehavior="blurAndSubmit"
                        multiline
                        numberOfLines={1}
                        onEndEditing={handleEndEdit}
                        onSubmitEditing={handleEndEdit}
                        onBlur={handleEndEdit}
                    />
                )}
            </View>
        </View>
    )
}

export default ThemedSlider

const useStyles = () => {
    const { color, borderRadius } = Theme.useTheme()
    return StyleSheet.create({
        itemName: {
            color: color.text._100,
        },

        itemNameDisabled: {
            color: color.text._700,
        },

        sliderContainer: {
            flexDirection: `row`,
        },

        slider: {
            flex: 9,
        },

        textBox: {
            color: color.text._100,
            borderWidth: 1,
            borderRadius: borderRadius.l,
            textAlign: `center`,
        },
    })
}
