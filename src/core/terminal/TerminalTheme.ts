import type { ITheme } from '@xterm/xterm'

/**
 * 终端配色：底色为品牌深蓝变体（--brand-navy #002f5b 深色区间，与
 * style.css 的 --terminal-bg/--terminal-fg 同步），ANSI 16 色保持 Orca Ghostty 调色。
 */
export const ORCA_TERMINAL_THEME: Readonly<ITheme> = {
  background: '#0d1b2e',
  foreground: '#ffffff',
  cursor: '#ffffff',
  cursorAccent: '#0d1b2e',
  selectionBackground: '#5a7898',
  selectionForeground: '#ffffff',
  black: '#1d1f21',
  red: '#cc6666',
  green: '#b5bd68',
  yellow: '#f0c674',
  blue: '#81a2be',
  magenta: '#b294bb',
  cyan: '#8abeb7',
  white: '#c5c8c6',
  brightBlack: '#666666',
  brightRed: '#d54e53',
  brightGreen: '#b9ca4a',
  brightYellow: '#e7c547',
  brightBlue: '#7aa6da',
  brightMagenta: '#c397d8',
  brightCyan: '#70c0b1',
  brightWhite: '#eaeaea',
}
