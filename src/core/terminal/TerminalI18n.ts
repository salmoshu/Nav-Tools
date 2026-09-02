import { inject, type InjectionKey } from 'vue'

/** 终端渲染层唯一需要的国际化接口；具体翻译实现由应用组合根注入。 */
export type TerminalTranslate = (key: string, named?: Record<string, unknown>) => string

export const TERMINAL_TRANSLATE_KEY: InjectionKey<TerminalTranslate> = Symbol('TerminalTranslate')

export function useTerminalTranslate(): TerminalTranslate {
  const translate = inject(TERMINAL_TRANSLATE_KEY)
  if (!translate) throw new Error('未注入终端翻译函数')
  return translate
}
