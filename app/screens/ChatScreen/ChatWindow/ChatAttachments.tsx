import { Dimensions, Pressable, View } from 'react-native'

import ScaledImage from '@components/views/ScaledImage'
import { Chats } from '@lib/state/Chat'
import { useImageViewerStore } from '@lib/state/components/ImageViewer'
import { Theme } from '@lib/theme/ThemeManager'

type ChatAttachmentsProps = {
    entry: Chats.db.live.LiveEntry
}

const ChatAttachments: React.FC<ChatAttachmentsProps> = ({ entry }) => {
    const { borderRadius } = Theme.useTheme()
    const openImage = useImageViewerStore((state) => state.open)
    if (entry.attachments.length < 1) return
    const images = entry.attachments.filter((item) => item.type === 'image')
    // const audio = message.attachments.filter((item) => item.type === 'audio')
    // const documents = message.attachments.filter((item) => item.type === 'document')
    return (
        <View style={{ rowGap: 8 }}>
            {images.length > 0 && (
                <View
                    style={{
                        paddingVertical: 4,
                        rowGap: 8,
                        columnGap: 8,
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                    }}>
                    {images.map((item) => (
                        <Pressable key={item.uri} onPress={() => openImage(item.uri)}>
                            <ScaledImage
                                cachePolicy="none"
                                uri={item.uri}
                                style={{
                                    height: Dimensions.get('window').height / 8,
                                    borderRadius: borderRadius.xl,
                                }}
                            />
                        </Pressable>
                    ))}
                </View>
            )}
        </View>
    )
}

export default ChatAttachments
