import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

export type AppLocale = 'zh-CN' | 'en-US'

const STORAGE_KEY = 'nav-tools:locale'

export function readStoredLocale(): AppLocale {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'zh-CN' ? 'zh-CN' : 'en-US'
  } catch {
    return 'en-US'
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

export default i18n

// 松散类型的 t，便于增量翻译阶段使用任意 key 而不触发 TS 严格校验。
// 注意：当前 locale 改变时，在渲染上下文中调用 t 仍会响应式更新。
export const t = (i18n.global.t as unknown) as (
  key: string,
  named?: Record<string, unknown>,
) => string

