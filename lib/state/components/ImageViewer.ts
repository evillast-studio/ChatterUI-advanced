import { create } from 'zustand'

type ImageViewerStateProps = {
    /** Imagen que se está viendo a pantalla completa; undefined = visor cerrado. */
    uri?: string
    open: (uri: string) => void
    close: () => void
}

export const useImageViewerStore = create<ImageViewerStateProps>()((set) => ({
    uri: undefined,
    open: (uri) => set({ uri }),
    close: () => set({ uri: undefined }),
}))
