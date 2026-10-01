import type { StorageLike } from '@/core/storage/JsonStorage'

/**
 * 终端输入历史的持久化存储:按会话类别(local / wsl / ssh)分桶,重启后仍可
 * ↑/↓ 翻阅与灰字提示。历史条目是完整命令文本,不包含任何输出内容。
 */
export const TERMINAL_HISTORY_STORAGE_KEY = 'nav-tools:terminal-history:v1'

/** 每个作用域保留的条数上限;超出后丢弃最旧的 */
export const TERMINAL_HISTORY_MAX_ENTRIES = 500
/** 单条命令的长度上限;超长命令(如粘贴的脚本)不污染历史 */
const MAX_COMMAND_LENGTH = 2000

export type TerminalHistoryScopeKind = 'local' | 'wsl' | 'ssh'

/** 同类会话共享一份历史:本机同 shell、同发行版 WSL、同 主机@用户:端口 SSH */
export function createTerminalHistoryScope(
  kind: TerminalHistoryScopeKind,
  detail = '',
): string {
  return `${kind}:${detail.trim()}`
}

export interface TerminalHistoryStore {
  load(scope: string): string[]
  /** 用给定的完整列表覆盖该作用域;空命令与超长命令被过滤,超出上限丢弃最旧的 */
  save(scope: string, commands: string[]): void
}

export function createTerminalHistoryStore(storage: StorageLike): TerminalHistoryStore {
  return {
    load(scope: string): string[] {
      return readScopes(storage)[scope] ?? []
    },
    save(scope: string, commands: string[]): void {
      if (!scope) return
      const entries: string[] = []
      for (const raw of commands) {
        const command = raw.trim()
        if (!command || command.length > MAX_COMMAND_LENGTH) continue
        const previous = entries.indexOf(command)
        if (previous >= 0) entries.splice(previous, 1)
        entries.push(command)
      }
      const scopes = readScopes(storage)
      scopes[scope] = entries.slice(-TERMINAL_HISTORY_MAX_ENTRIES)
      storage.setItem(TERMINAL_HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, scopes }))
    },
  }
}

function readScopes(storage: StorageLike): Record<string, string[]> {
  try {
    const raw = storage.getItem(TERMINAL_HISTORY_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const { version, scopes } = parsed as { version?: unknown; scopes?: unknown }
    if (version !== 1 || typeof scopes !== 'object' || scopes === null) return {}
    const result: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(scopes as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue
      const commands = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && entry.length <= MAX_COMMAND_LENGTH)
      result[key] = commands.slice(-TERMINAL_HISTORY_MAX_ENTRIES)
    }
    return result
  } catch {
    return {}
  }
}
