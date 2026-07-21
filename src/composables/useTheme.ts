import { computed, ref } from 'vue'
import {
  chartThemes,
  isThemeMode,
  resolveTheme,
  type ResolvedTheme,
  type ThemeMode,
} from '@/core/theme/theme'

export type { ResolvedTheme, ThemeMode } from '@/core/theme/theme'

const STORAGE_KEY = 'nav-tools:theme'

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isThemeMode(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

const themeMode = ref<ThemeMode>(readStoredTheme())
const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
const resolvedTheme = ref<ResolvedTheme>('light')
const chartTheme = computed(() => chartThemes[resolvedTheme.value])

function applyTheme(mode: ThemeMode) {
  const resolved: ResolvedTheme = resolveTheme(mode, systemThemeQuery.matches)
  const root = document.documentElement
  resolvedTheme.value = resolved
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.theme = resolved
  root.dataset.themeMode = mode
  root.style.colorScheme = resolved
}

function setTheme(mode: ThemeMode) {
  themeMode.value = mode
  applyTheme(mode)
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Theme switching still works when persistent storage is unavailable.
  }
}

applyTheme(themeMode.value)

systemThemeQuery.addEventListener('change', () => {
  if (themeMode.value === 'system') applyTheme('system')
})

window.addEventListener('storage', event => {
  if (
    event.key !== STORAGE_KEY
    || !isThemeMode(event.newValue)
  ) return
  themeMode.value = event.newValue
  applyTheme(event.newValue)
})

export function useTheme() {
  return {
    themeMode,
    resolvedTheme,
    chartTheme,
    isDark: computed(() => resolvedTheme.value === 'dark'),
    setTheme,
  }
}
