/**
 * ChatCacheManager — KV cache por conversación individual
 *
 * A diferencia del KV global (llama-session.bin), este manager guarda
 * un archivo de sesión separado por chatId. Permite retomar cualquier
 * conversación sin recalcular el contexto completo desde cero.
 *
 * Uso:
 *   const cache = new ChatCacheManager()
 *   await cache.saveChatSession(context, chatId)
 *   const ok = await cache.loadChatSession(context, chatId)
 */

import RNFS from '@vali98/react-native-fs'

import { AppDirectory } from '@lib/utils/File'
import { Logger } from '@lib/state/Logger'

export class ChatCacheManager {
    private baseDir: string

    constructor(baseDir?: string) {
        this.baseDir = baseDir ?? `${AppDirectory.SessionPath}chat_sessions`
        this.ensureDirectoryExists()
    }

    /** Crea el directorio de sesiones si no existe */
    private async ensureDirectoryExists(): Promise<void> {
        const exists = await RNFS.exists(this.baseDir)
        if (!exists) {
            await RNFS.mkdir(this.baseDir)
        }
    }

    /** Ruta del archivo de caché para un chatId específico */
    getSessionPath(chatId: number | string): string {
        return `${this.baseDir}/session_${chatId}.bin`
    }

    /**
     * Guarda el KV cache del contexto actual para el chat indicado.
     * Retorna true si tuvo éxito, false en caso contrario.
     */
    async saveChatSession(
        context: { saveSession: (path: string) => Promise<number> },
        chatId: number | string
    ): Promise<boolean> {
        if (!context || chatId === undefined || chatId === null) return false
        const sessionPath = this.getSessionPath(chatId)
        try {
            const tokens = await context.saveSession(sessionPath.replace('file://', ''))
            if (tokens === -1) {
                Logger.warn(`[ChatCacheManager] saveSession devolvió -1 para chat ${chatId}`)
                return false
            }
            Logger.info(`[ChatCacheManager] Caché guardado para chat ${chatId} (${tokens} tokens)`)
            return true
        } catch (error) {
            Logger.error(`[ChatCacheManager] Error al guardar caché para chat ${chatId}`, error)
            return false
        }
    }

    /**
     * Carga el KV cache de una sesión previa.
     * Si el archivo está corrupto, lo elimina automáticamente sin
     * afectar otras conversaciones.
     * Retorna true si la carga fue exitosa.
     */
    async loadChatSession(
        context: { loadSession: (path: string) => Promise<void> },
        chatId: number | string
    ): Promise<boolean> {
        if (!context || chatId === undefined || chatId === null) return false
        const sessionPath = this.getSessionPath(chatId)

        const exists = await RNFS.exists(sessionPath)
        if (!exists) return false

        try {
            await context.loadSession(sessionPath.replace('file://', ''))
            Logger.info(`[ChatCacheManager] Caché cargado para chat ${chatId}`)
            return true
        } catch (error) {
            Logger.warn(
                `[ChatCacheManager] Caché corrupto en chat ${chatId}. Eliminando perfil dañado...`,
                error
            )
            // Elimina solo el archivo afectado, sin tocar los demás chats
            await this.deleteChatSession(chatId)
            return false
        }
    }

    /**
     * Elimina el archivo de caché de una conversación específica.
     * Útil al borrar un chat o forzar regeneración.
     */
    async deleteChatSession(chatId: number | string): Promise<void> {
        const sessionPath = this.getSessionPath(chatId)
        if (await RNFS.exists(sessionPath)) {
            await RNFS.unlink(sessionPath)
            Logger.info(`[ChatCacheManager] Caché eliminado para chat ${chatId}`)
        }
    }

    /**
     * Elimina todos los archivos de caché de todas las conversaciones.
     */
    async clearAllSessions(): Promise<void> {
        if (await RNFS.exists(this.baseDir)) {
            await RNFS.unlink(this.baseDir)
            await RNFS.mkdir(this.baseDir)
            Logger.info('[ChatCacheManager] Todos los cachés eliminados')
        }
    }

    /**
     * Retorna el tamaño en bytes del archivo de caché de un chat,
     * o 0 si no existe.
     */
    async getSessionSize(chatId: number | string): Promise<number> {
        const sessionPath = this.getSessionPath(chatId)
        try {
            const stat = await RNFS.stat(sessionPath)
            return stat.size ?? 0
        } catch {
            return 0
        }
    }
}

/** Instancia singleton lista para usar en toda la app */
export const chatCacheManager = new ChatCacheManager()
