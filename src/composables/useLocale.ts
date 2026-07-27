import { ref, watch } from 'vue'
import i18n, { type AppLocale } from '@/i18n'

const STORAGE_KEY = 'nav-tools:locale'

function readStored(): AppLocale {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'zh-CN' ? 'zh-CN' : 'en-US'
  } catch {
    return 'en-US'
  }
}

// 单例：整个应用共享同一份语言状态
const locale = ref<AppLocale>(readStored())

// 初始化即应用一次
i18n.global.locale.value = locale.value
if (typeof document !== 'undefined') {
  document.documentElement.lang = locale.value
}

watch(locale, (value) => {
  i18n.global.locale.value = value
  if (typeof document !== 'undefined') {
    document.documentElement.lang = value
  }
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* 忽略持久化失败 */
  }
  // 通知其它模块（如 Element Plus 语言包切换）
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AppLocale>('app-locale-change', { detail: value }))
  }
})

export function useLocale() {
  return {
    locale,
    setLocale: (value: AppLocale) => {
      locale.value = value
    },
  }
}
