import { describe, expect, it } from 'vitest'
import {
  resolveTerminalShortcut,
  type TerminalShortcutInput,
} from '@/core/terminal/TerminalShortcuts'

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

describe('Terminal Orca-style shortcuts', () => {
  it('resolves tab navigation and selection on Windows', () => {
    expect(resolveTerminalShortcut(shortcut('t', { ctrlKey: true }), 'win32')).toEqual({
      type: 'new-tab',
    })
    expect(resolveTerminalShortcut(shortcut('PageDown', { ctrlKey: true }), 'win32')).toEqual({
      type: 'next-tab',
    })
    expect(resolveTerminalShortcut(shortcut('Tab', { ctrlKey: true }), 'win32')).toEqual({
      type: 'next-tab',
    })
    expect(
      resolveTerminalShortcut(shortcut('Tab', { ctrlKey: true, shiftKey: true }), 'win32'),
    ).toEqual({ type: 'previous-tab' })
    expect(resolveTerminalShortcut(shortcut('3', { altKey: true }), 'win32')).toEqual({
      type: 'select-tab',
      index: 2,
    })
  })

  it('resolves pane focus, split, and maximize on Windows', () => {
    expect(
      resolveTerminalShortcut(shortcut(']', { code: 'BracketRight', ctrlKey: true }), 'win32'),
    ).toEqual({ type: 'focus-next-pane' })
    expect(
      resolveTerminalShortcut(shortcut('d', { ctrlKey: true, shiftKey: true }), 'win32'),
    ).toEqual({ type: 'split-right' })
    expect(
      resolveTerminalShortcut(shortcut('d', { altKey: true, shiftKey: true }), 'win32'),
    ).toEqual({ type: 'split-down' })
    expect(
      resolveTerminalShortcut(shortcut('Enter', { ctrlKey: true, shiftKey: true }), 'win32'),
    ).toEqual({ type: 'toggle-expand-pane' })
  })

  it('uses the Orca macOS modifier variants', () => {
    expect(resolveTerminalShortcut(shortcut('d', { metaKey: true }), 'darwin')).toEqual({
      type: 'split-right',
    })
    expect(
      resolveTerminalShortcut(shortcut('d', { metaKey: true, shiftKey: true }), 'darwin'),
    ).toEqual({ type: 'split-down' })
    expect(resolveTerminalShortcut(shortcut('2', { ctrlKey: true }), 'darwin')).toEqual({
      type: 'select-tab',
      index: 1,
    })
  })

  it('does not trigger a shortcut from an unrelated modifier or key repeat', () => {
    expect(resolveTerminalShortcut(shortcut('d', { ctrlKey: true }), 'win32')).toBeNull()
    expect(
      resolveTerminalShortcut(shortcut('t', { ctrlKey: true, repeat: true }), 'win32'),
    ).toBeNull()
  })
})
