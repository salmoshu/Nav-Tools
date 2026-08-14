import { createBrowserIpcTransport } from '../platform/IpcTransport'
import { JsonStorage, type StorageLike } from '../storage/JsonStorage'
import { UpdaterService, type UpdaterPlatform } from './UpdaterService'

let instance: UpdaterService | undefined

export function getUpdaterService(): UpdaterService {
  if (!instance) {
    const fallback: UpdaterPlatform = {
      checkForUpdates: async () => undefined,
      downloadUpdate: async () => undefined,
      quitAndInstall: async () => undefined,
      setUpdaterPrefs: () => undefined,
    }
    instance = new UpdaterService(
      window.electronAPI ?? fallback,
      createBrowserIpcTransport(),
      new JsonStorage(resolveStorage()),
    )
  }
  return instance
}

/** 非浏览器环境(如 vitest node)没有 localStorage,退化为内存存储 */
function resolveStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // 访问 localStorage 抛错(如禁用 Cookie)时走内存存储
  }
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}
