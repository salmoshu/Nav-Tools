import { readFileSync, readdirSync } from 'node:fs'
import { createApp, defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  TERMINAL_TRANSLATE_KEY,
  useTerminalTranslate,
  type TerminalTranslate,
} from '@/core/terminal/TerminalI18n'

function readSource(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

describe('终端国际化依赖注入', () => {
  const terminalComponentDirectory = 'src/components/windows/common'
  const terminalComponentSources = readdirSync(terminalComponentDirectory)
    .filter((name) => name.startsWith('Terminal') && name.endsWith('.vue'))
    .map((name) => readSource(`${terminalComponentDirectory}/${name}`))
  const appSource = readSource('src/App.vue')

  it('终端组件不再直接依赖应用 i18n', () => {
    for (const source of terminalComponentSources) expect(source).not.toContain("from '@/i18n'")
    expect(
      terminalComponentSources.filter((source) => source.includes('useTerminalTranslate()')),
    ).toHaveLength(9)
  })

  it('应用组合根提供终端翻译适配器', () => {
    expect(appSource).toContain('provide(TERMINAL_TRANSLATE_KEY, t)')
    expect(appSource).toContain("import { t } from '@/i18n'")
  })

  it('通过注入接口转发键名与命名参数', () => {
    const host = document.createElement('div')
    const translate = vi.fn<TerminalTranslate>((key, named) => `${key}:${String(named?.count)}`)
    const Probe = defineComponent({
      setup() {
        const t = useTerminalTranslate()
        return () => h('span', t('common.terminal.fileTreeTruncated', { count: 2000 }))
      },
    })
    const app = createApp(Probe)
    app.provide(TERMINAL_TRANSLATE_KEY, translate)

    app.mount(host)

    expect(host.textContent).toBe('common.terminal.fileTreeTruncated:2000')
    expect(translate).toHaveBeenCalledWith('common.terminal.fileTreeTruncated', { count: 2000 })
    app.unmount()
  })
})
