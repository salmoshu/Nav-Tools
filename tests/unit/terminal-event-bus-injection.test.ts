import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

describe('终端事件总线依赖注入', () => {
  const terminalComponentDirectory = 'src/components/windows/common'
  const terminalComponentSources = readdirSync(terminalComponentDirectory)
    .filter((name) => name.startsWith('Terminal') && name.endsWith('.vue'))
    .map((name) => readSource(`${terminalComponentDirectory}/${name}`))
  const workbenchSource = readSource('src/components/windows/common/Terminal.vue')
  const paneSource = readSource('src/components/windows/common/TerminalPane.vue')
  const appSource = readSource('src/App.vue')

  it('终端组件不再直接依赖应用 useMitt', () => {
    for (const source of terminalComponentSources) expect(source).not.toContain('@/hooks/useMitt')
    for (const source of [workbenchSource, paneSource]) {
      expect(source).toContain('useTerminalEventBus()')
    }
  })

  it('应用组合根提供终端事件总线适配器', () => {
    expect(appSource).toContain('provide(TERMINAL_EVENT_BUS_KEY, terminalEventBus)')
    expect(appSource).toContain("import emitter from '@/hooks/useMitt'")
  })
})
