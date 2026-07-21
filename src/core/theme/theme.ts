export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = Exclude<ThemeMode, 'system'>

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  return mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode
}

export const chartThemes = {
  dark: {
    background: '#1d2027',
    surface: 'rgba(29, 32, 39, 0.96)',
    surfaceMuted: '#242832',
    text: '#d2d6dc',
    textMuted: '#9aa1ab',
    grid: '#363b46',
    border: '#474e5b',
  },
  light: {
    background: '#ffffff',
    surface: 'rgba(255, 255, 255, 0.96)',
    surfaceMuted: '#f8fafc',
    text: '#172033',
    textMuted: '#6b7585',
    grid: '#e0e0e0',
    border: '#d6dbe3',
  },
} as const
