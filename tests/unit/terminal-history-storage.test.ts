import { describe, expect, it } from 'vitest'
import {
  createTerminalHistoryScope,
  createTerminalHistoryStore,
  TERMINAL_HISTORY_MAX_ENTRIES,
} from '../../src/core/terminal/TerminalHistoryStorage'

function createMemoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

describe('terminal history storage', () => {
  it('saves and loads history per scope', () => {
    const storage = createMemoryStorage()
    const store = createTerminalHistoryStore(storage)
    const scope = createTerminalHistoryScope('local', 'bash')
    store.save(scope, ['git status', 'npm run build'])
    expect(store.load(scope)).toEqual(['git status', 'npm run build'])
    // 其他作用域互不影响
    expect(store.load(createTerminalHistoryScope('wsl', 'Ubuntu'))).toEqual([])
  })

  it('deduplicates repeated commands keeping the latest position', () => {
    const storage = createMemoryStorage()
    const store = createTerminalHistoryStore(storage)
    const scope = createTerminalHistoryScope('ssh', 'root@10.0.0.3:22')
    store.save(scope, ['ls', 'pwd', 'ls'])
    expect(store.load(scope)).toEqual(['pwd', 'ls'])
  })

  it('caps entries to the newest TERMINAL_HISTORY_MAX_ENTRIES', () => {
    const storage = createMemoryStorage()
    const store = createTerminalHistoryStore(storage)
    const scope = createTerminalHistoryScope('local', 'pwsh')
    store.save(
      scope,
      Array.from({ length: TERMINAL_HISTORY_MAX_ENTRIES + 50 }, (_, index) => `cmd-${index}`),
    )
    const loaded = store.load(scope)
    expect(loaded).toHaveLength(TERMINAL_HISTORY_MAX_ENTRIES)
    expect(loaded[0]).toBe(`cmd-${50}`)
    expect(loaded.at(-1)).toBe(`cmd-${TERMINAL_HISTORY_MAX_ENTRIES + 49}`)
  })

  it('filters empty and oversized commands on save and on load', () => {
    const storage = createMemoryStorage()
    const store = createTerminalHistoryStore(storage)
    const scope = createTerminalHistoryScope('local', 'bash')
    store.save(scope, ['  ', '   ls -la   ', 'x'.repeat(3000)])
    expect(store.load(scope)).toEqual(['ls -la'])
    // 直接污染存储的坏数据在读取时同样被清洗
    storage.setItem(
      'nav-tools:terminal-history:v1',
      JSON.stringify({ version: 1, scopes: { [scope]: ['', 42, 'ok', 'y'.repeat(5000)] } }),
    )
    expect(store.load(scope)).toEqual(['ok'])
  })

  it('tolerates corrupted or unknown storage payloads', () => {
    const storage = createMemoryStorage()
    storage.setItem('nav-tools:terminal-history:v1', '{broken json')
    const store = createTerminalHistoryStore(storage)
    expect(store.load('local:bash')).toEqual([])
    storage.setItem('nav-tools:terminal-history:v1', JSON.stringify({ version: 2 }))
    expect(store.load('local:bash')).toEqual([])
  })
})
