/* eslint-disable vue/one-component-per-file -- 复用 path-click-repro 测试的宿主模式 */
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalCommandBlock } from '@/core/terminal/CommandBlocks'
import { TERMINAL_TRANSLATE_KEY, type TerminalTranslate } from '@/core/terminal/TerminalI18n'

import TerminalGuiView from '../../src/components/windows/common/TerminalGuiView.vue'

const translate: TerminalTranslate = (key, named) =>
  named?.count === undefined ? key : `${key}:${String(named.count)}`

const Passthrough = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

function commandBlock(output: string, command = 'pwd'): TerminalCommandBlock {
  return {
    id: 1,
    command,
    output,
    startedAt: Date.now(),
    finishedAt: Date.now(),
    exitCode: 0,
    truncated: false,
  }
}

function mountGui(output: string, command?: string): { app: App; host: HTMLDivElement } {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(TerminalGuiView, {
    blocks: [commandBlock(output, command)],
    sessionId: 'session-1',
  })
  app.provide(TERMINAL_TRANSLATE_KEY, translate)
  for (const name of ['ElButton', 'ElIcon', 'ElTooltip']) app.component(name, Passthrough)
  app.mount(host)
  return { app, host }
}

async function flushUpdates(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

type InvokeMock = ReturnType<typeof vi.fn>

function invokeCalls(): Array<[string, unknown]> {
  return (window.ipcRenderer.invoke as InvokeMock).mock.calls as Array<[string, unknown]>
}

describe('TerminalGuiView 输出里的 http(s) 链接', () => {
  let mounted: { app: App; host: HTMLDivElement } | undefined

  beforeEach(() => {
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: vi.fn(() => Promise.resolve(null)),
        on: vi.fn(),
        off: vi.fn(),
        send: vi.fn(),
      },
    })
  })

  afterEach(() => {
    mounted?.app.unmount()
    mounted = undefined
    document.body.innerHTML = ''
  })

  it('链接直接渲染为锚点(无需存在性探测),点击交给系统浏览器', async () => {
    mounted = mountGui('200 OK, see https://example.com/docs/guide for details')
    await flushUpdates()

    const link = mounted.host.querySelector('.command-block__url') as HTMLAnchorElement
    expect(link, '链接应渲染为锚点').not.toBeNull()
    expect(link.textContent).toBe('https://example.com/docs/guide')
    // 链接不走路径的两级探测:不应发起 terminal-path-stat
    expect(invokeCalls().filter(([channel]) => channel === 'terminal-path-stat')).toHaveLength(0)

    link.click()
    await flushUpdates()

    expect(invokeCalls()).toContainEqual([
      'terminal-open-external',
      'https://example.com/docs/guide',
    ])
  })

  it('中文语境的结尾标点不进链接地址', async () => {
    mounted = mountGui('文档见 https://example.com/数据?页=1。', 'echo 文档')
    await flushUpdates()

    const link = mounted.host.querySelector('.command-block__url') as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.textContent).toBe('https://example.com/数据?页=1')

    link.click()
    await flushUpdates()

    expect(invokeCalls()).toContainEqual([
      'terminal-open-external',
      'https://example.com/数据?页=1',
    ])
  })

  it('同一段输出里链接与路径各自渲染:链接走浏览器,路径走存在性探测', async () => {
    mounted = mountGui('see https://example.com/x and src/main.c')
    await flushUpdates()

    expect(mounted.host.querySelector('.command-block__url')?.textContent).toBe(
      'https://example.com/x',
    )
    expect(mounted.host.querySelector('.command-block__path-candidate')?.textContent).toBe(
      'src/main.c',
    )
  })
})
