import { Image } from 'expo-image'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useShallow } from 'zustand/react/shallow'

import ThemedButton from '@components/buttons/ThemedButton'
import FadeBackrop from '@components/views/FadeBackdrop'
import { useImageViewerStore } from '@lib/state/components/ImageViewer'
import { Theme } from '@lib/theme/ThemeManager'

/**
 * Visor de imágenes a pantalla completa. Se abre con `useImageViewerStore.getState().open(uri)`
 * y se cierra tocando la imagen, el fondo o el botón de cerrar.
 */
const ImageViewer: React.FC = () => {
    const insets = useSafeAreaInsets()
    const { color, spacing } = Theme.useTheme()
    const { uri, close } = useImageViewerStore(
        useShallow((state) => ({ uri: state.uri, close: state.close }))
    )

    return (
        <Modal
            transparent
            statusBarTranslucent
            navigationBarTranslucent
            animationType="fade"
            visible={uri !== undefined}
            onRequestClose={close}>
            <FadeBackrop handleOverlayClick={close} />
            <Pressable
                onPress={close}
                style={[styles.container, { backgroundColor: color.shadow + '99' }]}>
                {uri !== undefined && (
                    <Animated.View entering={FadeIn} style={styles.fill}>
                        <Image source={{ uri }} contentFit="contain" style={styles.fill} />
                    </Animated.View>
                )}
            </Pressable>
            <View style={{ position: 'absolute', top: insets.top + spacing.l, right: spacing.l }}>
                <ThemedButton iconName="close" iconSize={22} variant="secondary" onPress={close} />
            </View>
        </Modal>
    )
}

export default ImageViewer

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    fill: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
})
