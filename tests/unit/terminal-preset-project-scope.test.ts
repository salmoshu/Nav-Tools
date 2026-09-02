/* eslint-disable vue/one-component-per-file -- Element Plus 测试桩集中放置，避免引入组件测试依赖 */
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeTextBase64 } from '@/core/terminal/CommandBlocks'
import { TERMINAL_TRANSLATE_KEY, type TerminalTranslate } from '@/core/terminal/TerminalI18n'
import { TerminalPresetStorage, createTerminalPreset } from '@/core/terminal/TerminalPresetStorage'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import TerminalPresetPanel from '../../src/components/windows/common/TerminalPresetPanel.vue'

const translate: TerminalTranslate = (key) => key

const Passthrough = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, [slots.default?.(), slots.footer?.()])
  },
})

const ButtonStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

function mountPanel(): { app: App; host: HTMLDivElement } {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(TerminalPresetPanel, {
    sessionId: 'session-1',
    projectCwd: '/work/nav-tools',
  })
  app.provide(TERMINAL_TRANSLATE_KEY, translate)
  for (const name of [
    'ElCheckbox',
    'ElDialog',
    'ElForm',
    'ElFormItem',
    'ElIcon',
    'ElInput',
    'ElOption',
    'ElSelect',
    'ElTooltip',
  ]) {
    app.component(name, Passthrough)
  }
  app.component('ElButton', ButtonStub)
  app.mount(host)
  return { app, host }
}

async function flushProjectLoad(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('TerminalPresetPanel project scope', () => {
  let mounted: { app: App; host: HTMLDivElement } | undefined
  const invoke = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    new TerminalPresetStorage(localStorage).save({
      ...createTerminalPreset(),
      name: '全局检查',
      command: 'pnpm typecheck',
    })
    invoke.mockImplementation(async (channel: string) => {
      if (channel !== 'terminal-path-read') return undefined
      return {
        mime: 'application/json',
        data: encodeTextBase64(
          JSON.stringify({
            version: 1,
            presets: [{ id: 'test', name: '项目测试', command: 'pnpm vitest run' }],
          }),
        ),
        size: 100,
        truncated: false,
      }
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { invoke },
    })
  })

  afterEach(() => {
    mounted?.app.unmount()
    mounted = undefined
    document.body.innerHTML = ''
    localStorage.clear()
    invoke.mockReset()
  })

  it('loads the cwd project file, merges both scopes and keeps project entries read-only', async () => {
    mounted = mountPanel()
    await flushProjectLoad()

    expect(invoke).toHaveBeenCalledWith('terminal-path-read', {
      sessionId: 'session-1',
      path: '.nav-tools/terminal-presets.json',
      maxBytes: 256 * 1024,
    })
    const items = Array.from(mounted.host.querySelectorAll('.preset-item'))
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('项目测试')
    expect(items[0].textContent).toContain('common.terminal.presetScopeProject')
    expect(items[0].querySelectorAll('.preset-item__actions button')).toHaveLength(1)
    expect(items[1].textContent).toContain('全局检查')
    expect(items[1].textContent).toContain('common.terminal.presetScopeGlobal')
    expect(items[1].querySelectorAll('.preset-item__actions button')).toHaveLength(3)

    ;(items[0].querySelector('.preset-item__actions button') as HTMLButtonElement).click()
    await nextTick()
    expect(invoke).toHaveBeenCalledWith('terminal-session-run-command', {
      sessionId: 'session-1',
      command: 'pnpm vitest run',
      cwd: undefined,
      values: {},
    })
  })
})
