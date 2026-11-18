import { useAudioRecorder, useAudioRecorderState, AudioModule, RecordingPresets } from 'expo-audio'
import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons/static'

import { Logger } from '@lib/state/Logger'
import { Theme } from '@lib/theme/ThemeManager'

import BottomSheet, { BottomSheetRef } from './BottomSheet'

interface AudioSheetProps {
    ref: BottomSheetRef
    onRecorded: (uri: string) => void
}

const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const AudioSheet: React.FC<AudioSheetProps> = ({ ref, onRecorded }) => {
    const { color, borderRadius, fontSize, spacing } = Theme.useTheme()
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
    const recorderState = useAudioRecorderState(recorder)
    const recording = recorderState.isRecording
    const [elapsed, setElapsed] = useState(0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const startRecording = async () => {
        try {
            const status = await AudioModule.requestRecordingPermissionsAsync()
            if (!status.granted) {
                Logger.warnToast('Microphone permission denied')
                return
            }
            await recorder.prepareToRecordAsync()
            recorder.record()
            setElapsed(0)
            timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
        } catch (e) {
            Logger.error('[AudioSheet] ' + e)
        }
    }

    const stopRecording = async () => {
        if (!recording) return
        clearInterval(timerRef.current!)
        timerRef.current = null
        await recorder.stop()
        const uri = recorder.uri
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
            <Pressable
                onPress={recording ? stopRecording : startRecording}
                style={{
                    width: 72,
                    height: 72,
                    borderRadius: borderRadius.full,
                    backgroundColor: recording ? color.error._300 : color.primary._300,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                <MaterialIcons
                    name={recording ? 'stop' : 'mic'}
                    size={32}
                    color={color.text._100}
                />
            </Pressable>
            <Text style={{ color: color.text._400, fontSize: fontSize.m }}>
                {recording ? 'Recording… tap to stop' : 'Tap to start recording'}
            </Text>
        </BottomSheet>
    )
}

export default AudioSheet
