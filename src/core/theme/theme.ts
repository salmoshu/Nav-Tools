export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = Exclude<ThemeMode, 'system'>

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  return mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode
}

// ECharts 不走 CSS 变量，色值与 src/styles/kimi-tokens.css 手工对齐（行尾注释互证）。
export const chartThemes = {
  dark: {
    background: '#121212', // --Bg-Primary
    surface: 'rgba(18, 18, 18, 0.9)', // --Bg-Primary90
    surfaceMuted: '#1f1f1f', // --Bg-Secondary
    text: '#ffffffd6', // --Labels-Primary
    textMuted: '#ffffff6b', // --Labels-Tertiary
    grid: '#ffffff1a', // --Fills-F2
    border: '#ffffff1f', // --Separators-S1
  },
  light: {
    background: '#ffffff', // --Bg-Primary
    surface: 'rgba(255, 255, 255, 0.9)', // --Bg-Primary90
    surfaceMuted: '#f5f5f5', // --Bg-Secondary
    text: '#000000e6', // --Labels-Primary
    textMuted: '#00000073', // --Labels-Tertiary
    grid: '#00000014', // --Fills-F2-hover
    border: '#00000021', // --Separators-S1
  },
} as const
