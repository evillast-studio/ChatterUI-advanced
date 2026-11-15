import { Audio } from 'expo-av'
import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'

import ThemedButton from '@components/buttons/ThemedButton'
import { Logger } from '@lib/state/Logger'
import { Theme } from '@lib/theme/ThemeManager'

import BottomSheet, { BottomSheetRef } from './BottomSheet'

interface AudioSheetProps {
    ref: BottomSheetRef
    onRecorded: (uri: string) => void
}

const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const AudioSheet: React.FC<AudioSheetProps> = ({ ref, onRecorded }) => {
    const { color, borderRadius, fontSize, spacing } = Theme.useTheme()
    const [recording, setRecording] = useState<Audio.Recording | null>(null)
    const [elapsed, setElapsed] = useState(0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const startRecording = async () => {
        try {
            const { granted } = await Audio.requestPermissionsAsync()
            if (!granted) {
                Logger.warnToast('Microphone permission denied')
                return
            }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
            const { recording: rec } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            )
            setRecording(rec)
            setElapsed(0)
            timerRef.current = setInterval(() => setElapsed((e) => e + 1000), 1000)
        } catch (e) {
            Logger.error('[AudioSheet] ' + e)
        }
    }

    const stopRecording = async () => {
        if (!recording) return
        clearInterval(timerRef.current!)
        await recording.stopAndUnloadAsync()
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
        const uri = recording.getURI()
        setRecording(null)
        setElapsed(0)
        if (uri) {
            onRecorded(uri)
            ref.current?.close()
        }
    }

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [])

    return (
        <BottomSheet
            ref={ref}
            sheetStyle={{ padding: spacing.xl, alignItems: 'center', rowGap: spacing.xl }}>
            <Text
                style={{
                    color: color.text._100,
                    fontSize: fontSize.xl2,
                    fontWeight: '600',
                    fontVariant: ['tabular-nums'],
                }}>
                {formatTime(elapsed)}
            </Text>
            <View
                style={{
                    width: 72,
                    height: 72,
                    borderRadius: borderRadius.full,
                    backgroundColor: recording ? color.error._300 : color.primary._300,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                <ThemedButton
                    iconName={recording ? 'stop' : 'mic'}
                    iconSize={32}
                    variant="plain"
                    buttonStyle={{ padding: spacing.m }}
                    onPress={recording ? stopRecording : startRecording}
                />
            </View>
            <Text style={{ color: color.text._400, fontSize: fontSize.m }}>
                {recording ? 'Recording… tap to stop' : 'Tap to start recording'}
            </Text>
        </BottomSheet>
    )
}

export default AudioSheet
