/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TERMINAL_TRANSLATE_KEY } from '@/core/terminal/TerminalI18n'
import type { SftpTransferEvent } from '@/core/terminal/TerminalTypes'

vi.mock('../../src/components/windows/common/TerminalFileTree.vue', async () => {
  const { defineComponent } = await import('vue')
  return { default: defineComponent({ template: '<div class="file-tree-stub" />' }) }
})

import TerminalFileTreePanel from '../../src/components/windows/common/TerminalFileTreePanel.vue'

const Passthrough = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

let app: App | undefined
let host: HTMLDivElement | undefined
let transferHandler: ((event: unknown, data: SftpTransferEvent) => void) | undefined

function emitTransfer(partial: Partial<SftpTransferEvent>): void {
  transferHandler?.(null, {
    sessionId: 'session-a',
    operationId: 'op-a',
    direction: 'download',
    name: 'a.bin',
    transferred: 0,
    total: 100,
    status: 'running',
    ...partial,
  })
}

beforeEach(() => {
  transferHandler = undefined
  Object.defineProperty(window, 'ipcRenderer', {
    configurable: true,
    value: {
      invoke: vi.fn(async () => undefined),
      on: vi.fn((channel: string, listener: (event: unknown, data: SftpTransferEvent) => void) => {
        if (channel === 'terminal-sftp-transfer') transferHandler = listener
      }),
      off: vi.fn(),
      send: vi.fn(),
    },
  })
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(TerminalFileTreePanel, {
    sessionId: 'session-a',
    kind: 'ssh',
    platform: 'win32',
  })
  app.provide(TERMINAL_TRANSLATE_KEY, (key, named) => {
    if (key === 'common.terminal.fileTreeStatusDownloadingMany') {
      return `Downloading ${named?.count} items`
    }
    return key
  })
  for (const name of ['ElInput', 'ElTooltip', 'ElButton', 'ElIcon']) {
    app.component(name, Passthrough)
  }
  app.mount(host)
})

afterEach(() => {
  app?.unmount()
  host?.remove()
  app = undefined
  host = undefined
  transferHandler = undefined
})

describe('TerminalFileTreePanel 总下载进度', () => {
  it('按多个任务的整批字节显示百分比和动画，未知总量时切换不定态', async () => {
    emitTransfer({ operationId: 'op-a', transferred: 50, total: 100 })
    emitTransfer({ operationId: 'op-b', name: 'b.bin', transferred: 30, total: 200 })
    await nextTick()

    const progress = host!.querySelector('[role="progressbar"]')!
    expect(progress.getAttribute('aria-valuenow')).toBe('27')
    expect(progress.classList).not.toContain('file-tree-status__progress--indeterminate')
    expect(host!.querySelector('.file-tree-status__percent')?.textContent).toBe('27%')
    expect(
      host!.querySelector('.file-tree-status__progress-fill')?.getAttribute('style'),
    ).toContain('scaleX(0.27)')
    expect(host!.querySelector('.file-tree-status__detail')?.textContent).toBe('80.0/300.0 B')
    expect(host!.querySelector('.file-tree-status__text')?.textContent).toBe('Downloading 2 items')

    emitTransfer({ operationId: 'op-c', name: 'stream', transferred: 10, total: 0 })
    await nextTick()

    expect(progress.classList).toContain('file-tree-status__progress--indeterminate')
    expect(progress.getAttribute('aria-valuenow')).toBeNull()
    expect(host!.querySelector('.file-tree-status__percent')).toBeNull()
    expect(host!.querySelector('.file-tree-status__detail')?.textContent).toBe('90 B')
  })

  it('全部任务完成后收起运行进度条并保留聚合成功状态', async () => {
    emitTransfer({ operationId: 'op-a', transferred: 100, total: 100, status: 'success' })
    emitTransfer({
      operationId: 'op-b',
      name: 'b.bin',
      transferred: 200,
      total: 200,
      status: 'success',
    })
    await nextTick()

    expect(host!.querySelector('[role="progressbar"]')).toBeNull()
    expect(host!.querySelector('.file-tree-status__percent')).toBeNull()
    expect(host!.querySelector('.file-tree-status--success')).not.toBeNull()
  })
})
