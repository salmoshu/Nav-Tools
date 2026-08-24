export type TerminalShortcutAction =
  | { type: 'new-tab' }
  | { type: 'close-active' }
  | { type: 'next-tab' }
  | { type: 'previous-tab' }
  | { type: 'select-tab'; index: number }
  | { type: 'focus-next-pane' }
  | { type: 'focus-previous-pane' }
  | { type: 'split-right' }
  | { type: 'split-down' }
  | { type: 'toggle-expand-pane' }

export interface TerminalShortcutInput {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat?: boolean
}

export function resolveTerminalShortcut(
  event: TerminalShortcutInput,
  platform: string,
): TerminalShortcutAction | null {
  if (event.repeat) return null
  const isMac = platform === 'darwin'
  const primary = isMac ? event.metaKey : event.ctrlKey
  const noPrimary = isMac ? !event.metaKey : !event.ctrlKey
  const key = event.key.toLowerCase()

  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab') {
    return { type: event.shiftKey ? 'previous-tab' : 'next-tab' }
  }
  if (primary && !event.altKey && !event.shiftKey && key === 't') return { type: 'new-tab' }
  if (primary && !event.altKey && !event.shiftKey && key === 'w') return { type: 'close-active' }
  if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    if (event.key === 'PageDown') return { type: 'next-tab' }
    if (event.key === 'PageUp') return { type: 'previous-tab' }
  }
  if (primary && !event.altKey && !event.shiftKey) {
    if (event.code === 'BracketRight') return { type: 'focus-next-pane' }
    if (event.code === 'BracketLeft') return { type: 'focus-previous-pane' }
  }
  if (
    ((isMac && primary && !event.shiftKey) || (!isMac && primary && event.shiftKey)) &&
    !event.altKey &&
    key === 'd'
  )
    return { type: 'split-right' }
  if (
    ((isMac && primary && !event.altKey) || (!isMac && noPrimary && event.altKey)) &&
    event.shiftKey &&
    key === 'd'
  )
    return { type: 'split-down' }
  if (primary && !event.altKey && event.shiftKey && event.key === 'Enter')
    return { type: 'toggle-expand-pane' }

  const digit = Number(event.key)
  const selectsByIndex = isMac
    ? event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    : event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
  if (selectsByIndex && Number.isInteger(digit) && digit >= 1 && digit <= 9)
    return { type: 'select-tab', index: digit - 1 }

  return null
}
