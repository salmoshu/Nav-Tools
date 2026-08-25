import { describe, expect, it } from 'vitest'
import {
  TERMINAL_SHORTCUTS_STORAGE_KEY,
  TerminalShortcutSettings,
  type TerminalShortcutInput,
} from '@/core/terminal/TerminalShortcuts'

class MemoryStorage {
  private readonly data = new Map<string, string>()

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }
}

function shortcut(
  key: string,
  modifiers: Partial<TerminalShortcutInput> = {},
): TerminalShortcutInput {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  }
}

describe('TerminalShortcutSettings', () => {
  it('persists a changed binding and resolves the configured action after reload', () => {
    const storage = new MemoryStorage()
    const settings = new TerminalShortcutSettings(storage, 'win32')

    expect(settings.updateBinding('new-tab', 0, shortcut('F2', { ctrlKey: true }))).toMatchObject({
      ok: true,
    })
    expect(settings.resolve(shortcut('F2', { ctrlKey: true }))).toEqual({ type: 'new-tab' })

    const reloaded = new TerminalShortcutSettings(storage, 'win32')
    expect(reloaded.resolve(shortcut('F2', { ctrlKey: true }))).toEqual({ type: 'new-tab' })
    expect(JSON.parse(storage.getItem(TERMINAL_SHORTCUTS_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 1,
    })
  })

  it('rejects an empty or modifier-free binding without changing the current action', () => {
    const settings = new TerminalShortcutSettings(new MemoryStorage(), 'win32')

    const empty = settings.updateBinding('new-tab', 0, shortcut(''))
    expect(empty).toMatchObject({ ok: false, error: { code: 'invalid-binding' } })

    const modifierFree = settings.updateBinding('new-tab', 0, shortcut('F2'))
    expect(modifierFree).toMatchObject({ ok: false, error: { code: 'invalid-binding' } })
    expect(settings.resolve(shortcut('t', { ctrlKey: true }))).toEqual({ type: 'new-tab' })
  })

  it('rejects a binding that conflicts with another command', () => {
    const settings = new TerminalShortcutSettings(new MemoryStorage(), 'win32')

    const result = settings.updateBinding('close-active', 0, shortcut('t', { ctrlKey: true }))
    expect(result).toMatchObject({ ok: false, error: { code: 'conflict' } })
    expect(settings.resolve(shortcut('t', { ctrlKey: true }))).toEqual({ type: 'new-tab' })
  })

  it('supports the dynamic select-tab binding and restores platform defaults', () => {
    const settings = new TerminalShortcutSettings(new MemoryStorage(), 'win32')

    expect(settings.resolve(shortcut('3', { altKey: true }))).toEqual({
      type: 'select-tab',
      index: 2,
    })
    expect(settings.updateBinding('select-tab', 0, shortcut('3', { ctrlKey: true }))).toMatchObject(
      {
        ok: true,
      },
    )
    expect(settings.resolve(shortcut('3', { ctrlKey: true, code: 'Digit3' }))).toEqual({
      type: 'select-tab',
      index: 2,
    })

    settings.reset()
    expect(settings.resolve(shortcut('3', { altKey: true }))).toEqual({
      type: 'select-tab',
      index: 2,
    })
    expect(settings.resolve(shortcut('3', { ctrlKey: true, code: 'Digit3' }))).toBeNull()
  })

  it('ignores malformed persisted data and keeps a usable default map', () => {
    const storage = new MemoryStorage()
    storage.setItem(TERMINAL_SHORTCUTS_STORAGE_KEY, '{not-json')

    const settings = new TerminalShortcutSettings(storage, 'win32')
    expect(settings.resolve(shortcut('t', { ctrlKey: true }))).toEqual({ type: 'new-tab' })
  })

  it('reloads a long-lived consumer after another settings surface writes storage', () => {
    const storage = new MemoryStorage()
    const liveSettings = new TerminalShortcutSettings(storage, 'win32')
    const otherSettings = new TerminalShortcutSettings(storage, 'win32')

    expect(
      otherSettings.updateBinding('new-tab', 0, shortcut('F3', { ctrlKey: true })),
    ).toMatchObject({
      ok: true,
    })
    expect(liveSettings.resolve(shortcut('F3', { ctrlKey: true }))).toBeNull()

    liveSettings.reload()
    expect(liveSettings.resolve(shortcut('F3', { ctrlKey: true }))).toEqual({ type: 'new-tab' })
  })
})
