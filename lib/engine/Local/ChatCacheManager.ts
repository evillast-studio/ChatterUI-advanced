/**
 * ChatCacheManager — KV cache persistente por conversación.
 *
 * Por cada chat se guardan dos archivos en `session/chat_kv/`:
 *   - session_<chatId>.bin    estado KV de llama.cpp (saveSession / loadSession)
 *   - session_<chatId>.json   tokens del prompt con el que se generó ese estado
 *
 * Los tokens viven en disco (no en MMKV/memoria) y solo se leen cuando se va a
 * decidir si cargar el .bin de un chat, así la app no los mantiene en RAM.
 */

import { File } from 'expo-file-system'

import { Logger } from '@lib/state/Logger'
import {
    AppDirectory,
    deleteFile,
    fileExists,
    fileInfo,
    listFiles,
    makeDirectory,
} from '@lib/utils/File'

/** Máximo de chats con KV guardado por personaje; al pasarse se borran los más antiguos de ese personaje. */
const MAX_CHATS_PER_CHARACTER = 8

const toNativePath = (uri: string) => uri.replace('file://', '')

export class ChatCacheManager {
    private readonly baseDir = `${AppDirectory.SessionPath}chat_kv/`

    private ensureDirectory() {
        // makeDirectory es async: sin .catch un fallo sería un rechazo sin manejar
        for (const dir of [AppDirectory.SessionPath, this.baseDir]) {
            makeDirectory(dir).catch((e) =>
                Logger.error(`[ChatCacheManager] No se pudo crear ${dir}: ${e}`)
            )
        }
    }

    getSessionPath(chatId: number) {
        return `${this.baseDir}session_${chatId}.bin`
    }

    private getTokensPath(chatId: number) {
        return `${this.baseDir}session_${chatId}.json`
    }

    hasSession(chatId: number) {
        try {
            return fileExists(this.getSessionPath(chatId))
        } catch {
            return false
        }
    }

    /** Guarda el KV actual del contexto. Devuelve los tokens escritos, o -1 si falló. */
    async saveChatSession(
        context: { saveSession: (path: string) => Promise<number> },
        chatId: number
    ): Promise<number> {
        this.ensureDirectory()
        try {
            const tokens = await context.saveSession(toNativePath(this.getSessionPath(chatId)))
            if (tokens === -1) {
                Logger.warn(`[ChatCacheManager] saveSession devolvió -1 (chat ${chatId})`)
                return -1
            }
            return tokens
        } catch (e) {
            Logger.error(`[ChatCacheManager] Error al guardar KV del chat ${chatId}: ${e}`)
            return -1
        }
    }

    /** Carga el KV de un chat. Si el archivo está corrupto lo borra y devuelve false. */
    async loadChatSession(
        context: { loadSession: (path: string) => Promise<unknown> },
        chatId: number
    ): Promise<boolean> {
        if (!this.hasSession(chatId)) return false
        try {
            await context.loadSession(toNativePath(this.getSessionPath(chatId)))
            return true
        } catch (e) {
            Logger.warn(`[ChatCacheManager] KV corrupto en chat ${chatId}, eliminando: ${e}`)
            this.deleteChatSession(chatId)
            return false
        }
    }

    saveTokens(chatId: number, tokens: number[]) {
        try {
            const file = new File(this.getTokensPath(chatId))
            if (!file.exists) file.create()
            file.write(JSON.stringify(tokens))
        } catch (e) {
            Logger.warn(`[ChatCacheManager] No se pudieron guardar los tokens del chat ${chatId}: ${e}`)
        }
    }

    /** Tokens del prompt guardado, o undefined si no hay / no se pueden leer. */
    async readTokens(chatId: number): Promise<number[] | undefined> {
        try {
            const path = this.getTokensPath(chatId)
            if (!fileExists(path)) return undefined
            const parsed = JSON.parse(await new File(path).text())
            return Array.isArray(parsed) ? parsed : undefined
        } catch {
            return undefined
        }
    }

    deleteChatSession(chatId: number) {
        deleteFile(this.getSessionPath(chatId))
        deleteFile(this.getTokensPath(chatId))
    }

    clearAllSessions() {
        for (const name of this.listSessionFiles()) deleteFile(`${this.baseDir}${name}`)
    }

    /** Tamaño total en bytes de todos los KV guardados. */
    getTotalSize() {
        let total = 0
        for (const name of this.listSessionFiles()) {
            try {
                total += fileInfo(`${this.baseDir}${name}`).size ?? 0
            } catch {}
        }
        return total
    }

    /** Borra los KV de chats que ya no existen. */
    pruneOrphans(validChatIds: Set<number>) {
        for (const id of this.listChatIds()) {
            if (!validChatIds.has(id)) this.deleteChatSession(id)
        }
    }

    /**
     * Si hay más de MAX_CHATS_PER_CHARACTER KV del mismo personaje, borra los menos recientes.
     * Cada personaje tiene su propio límite de 8 chats independientemente de los demás.
     */
    pruneOldest(keepChatId: number, characterChatIds: number[]) {
        try {
            // Solo los chats de este personaje que tengan KV guardado
            const entries = characterChatIds
                .filter((id) => this.hasSession(id))
                .map((id) => ({
                    id,
                    modified: (() => { try { return fileInfo(this.getSessionPath(id)).modificationTime ?? 0 } catch { return 0 } })(),
                }))
            if (entries.length <= MAX_CHATS_PER_CHARACTER) return
            entries
                .filter((item) => item.id !== keepChatId)
                .sort((a, b) => a.modified - b.modified)
                .slice(0, entries.length - MAX_CHATS_PER_CHARACTER)
                .forEach((item) => this.deleteChatSession(item.id))
        } catch (e) {
            Logger.warn(`[ChatCacheManager] No se pudo limpiar KV antiguos: ${e}`)
        }
    }

    private listSessionFiles(): string[] {
        try {
            return listFiles(this.baseDir)
        } catch {
            return []
        }
    }

    private listChatIds(): number[] {
        const ids = new Set<number>()
        for (const name of this.listSessionFiles()) {
            const match = /^session_(\d+)\.bin$/.exec(name)
            if (match) ids.add(Number(match[1]))
        }
        return [...ids]
    }
}

export const chatCacheManager = new ChatCacheManager()
