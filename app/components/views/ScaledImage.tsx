import { Image, ImageProps } from 'expo-image'
import { useEffect, useState } from 'react'
import { Image as RNImage } from 'react-native'

interface ScaledImageProps extends ImageProps {
    uri: string
}

const ScaledImage: React.FC<ScaledImageProps> = ({ uri, style }) => {
    const [aspectRatio, setAspectRatio] = useState(1)
    useEffect(() => {
        let cancelled = false
        RNImage.getSize(
            uri,
            (width, height) => {
                if (!cancelled) setAspectRatio(width / height)
            },
            () => {
                if (!cancelled) setAspectRatio(1)
            }
        )
        return () => { cancelled = true }
    }, [uri])
    return <Image source={{ uri: uri }} style={[style, { aspectRatio: aspectRatio }]} />
}

export default ScaledImage
