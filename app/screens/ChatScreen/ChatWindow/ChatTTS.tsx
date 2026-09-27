import Octicons from '@react-native-vector-icons/octicons/static'
import { TouchableOpacity, View } from 'react-native'
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated'

import { ChatSwipe } from '@db/schema'
import { Chats, useInference } from '@lib/state/Chat'
import { Logger } from '@lib/state/Logger'
import { useTTSStore } from '@lib/state/TTS'
import { Theme } from '@lib/theme/ThemeManager'

type TTSProps = {
    swipe: ChatSwipe
}

const ChatTTS: React.FC<TTSProps> = ({ swipe }) => {
    const { color } = Theme.useTheme()
    const { startTTS, activeSwipeId, stopTTS, enabled } = useTTSStore()
    const swipeText = swipe.swipe
    const nowGenerating = useInference((state) => state.nowGenerating)
    const isSpeaking = swipe.id === activeSwipeId

    // Detectar si este chat tiene perfil de voz propio
    const chatId = Chats.useChatState((state) => state.id)
    const hasChatProfile = useTTSStore(
        (state) => chatId !== undefined && !!state.chatVoiceProfiles[chatId]
    )

    const handleSpeak = async () => {
        swipeText && (await startTTS(swipeText, swipe.id))
    }

    const handleStopSpeaking = async () => {
        Logger.info('TTS stopped')
        await stopTTS()
    }

    if (!enabled) return null

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {isSpeaking ? (
                <Animated.View entering={ZoomIn.duration(200)} exiting={ZoomOut.duration(200)}>
                    <TouchableOpacity onPress={handleStopSpeaking}>
                        <Octicons name="mute" size={24} color={color.error._500} />
                    </TouchableOpacity>
                </Animated.View>
            ) : (
                <Animated.View entering={ZoomIn.duration(200)} exiting={ZoomOut.duration(200)}>
                    <TouchableOpacity onPress={handleSpeak} disabled={nowGenerating}>
                        <Octicons
                            name="unmute"
                            size={24}
                            color={
                                nowGenerating
                                    ? color.text._600
                                    : hasChatProfile
                                      ? color.warning._400
                                      : color.primary._400
                            }
                        />
                    </TouchableOpacity>
                </Animated.View>
            )}
        </View>
    )
}

export default ChatTTS
