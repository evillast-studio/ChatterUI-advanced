import { Dimensions, Pressable, Text, View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons/static'

import ScaledImage from '@components/views/ScaledImage'
import { Chats } from '@lib/state/Chat'
import { useImageViewerStore } from '@lib/state/components/ImageViewer'
import { Theme } from '@lib/theme/ThemeManager'

type ChatAttachmentsProps = {
    entry: Chats.db.live.LiveEntry
}

const ChatAttachments: React.FC<ChatAttachmentsProps> = ({ entry }) => {
    const { borderRadius, color, fontSize, spacing } = Theme.useTheme()
    const openImage = useImageViewerStore((state) => state.open)
    if (entry.attachments.length < 1) return
    const images = entry.attachments.filter((item) => item.type === 'image')
    const documents = entry.attachments.filter((item) => item.type === 'document')
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
            {documents.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s }}>
                    {documents.map((item) => (
                        <View
                            key={item.uri}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                columnGap: spacing.s,
                                paddingVertical: spacing.xs,
                                paddingHorizontal: spacing.m,
                                backgroundColor: color.neutral._300,
                                borderRadius: borderRadius.full,
                                borderWidth: 1,
                                borderColor: color.neutral._500,
                            }}>
                            <MaterialIcons name="file-text" size={14} color={color.text._400} />
                            <Text
                                numberOfLines={1}
                                style={{
                                    color: color.text._300,
                                    fontSize: fontSize.s,
                                    maxWidth: 180,
                                }}>
                                {item.name}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    )
}

export default ChatAttachments
