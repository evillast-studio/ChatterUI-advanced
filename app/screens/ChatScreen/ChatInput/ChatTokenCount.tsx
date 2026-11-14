import { useTranslation } from 'react-i18next'
import { View, Text } from 'react-native'
import { Bar } from 'react-native-progress'

import { useContextLimit } from '@lib/hooks/ContextLimit'
import { useLiveQueryJoined } from '@lib/hooks/LiveQueryJoined'
import { Characters } from '@lib/state/Characters'
import { Chats } from '@lib/state/Chat'
import { Theme } from '@lib/theme/ThemeManager'

export const useContextProgress = () => {
    const { id: chatId } = Chats.useChatState()
    const cardTokenCount = Characters.useCharacterStore(
        (state) => state.tokenCache?.description_length ?? 0
    )
    const { data } = useLiveQueryJoined(Chats.db.live.tokenCount(chatId ?? -1))
    const maxLength = useContextLimit()

    const tokenCount = parseFloat(data?.[0]?.totalTokens ?? '0') + cardTokenCount
    const progress = Math.min(1, Math.max(0, tokenCount / maxLength))

    return { tokenCount, maxLength, progress }
}

const ChatTokenCount: React.FC = () => {
    const { t } = useTranslation()
    const { tokenCount, maxLength, progress } = useContextProgress()
    const { color, fontSize } = Theme.useTheme()

    const leftover = maxLength - tokenCount
    const warning = leftover < Math.min(2048, 0.25 * maxLength)
    const genLengthColor = warning ? color.error._300 : color.primary._500

    return (
        <View style={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8 }}>
            <Text style={{ color: color.text._300, paddingBottom: 2, marginLeft: 4 }}>
                {t('chat.tokencount.title')}
            </Text>
            <Bar
                style={{ borderWidth: 2, backgroundColor: color.neutral._100 }}
                progress={progress}
                color={genLengthColor}
                borderColor={color.neutral._300}
                height={12}
                borderRadius={12}
                width={null}
            />
            <Text style={{ color: color.text._400, fontSize: fontSize.s, marginLeft: 4 }}>
                {tokenCount} / {maxLength}
            </Text>
        </View>
    )
}

export default ChatTokenCount
