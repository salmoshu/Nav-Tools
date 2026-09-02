/* eslint-disable vue/one-component-per-file -- 测试宿主与 Element Plus 桩集中在同一文件便于复用 */
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  type App,
  type PropType,
} from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalCommandBlock } from '@/core/terminal/CommandBlocks'
import { TERMINAL_TRANSLATE_KEY, type TerminalTranslate } from '@/core/terminal/TerminalI18n'

import TerminalGuiView from '../../src/components/windows/common/TerminalGuiView.vue'

const translate: TerminalTranslate = (key, named) =>
  named?.count === undefined ? key : `${key}:${String(named.count)}`

interface TreeNode {
  name: string
  directory: boolean
  isLeaf: boolean
}

type TreeLoader = (
  node: { level: number; data?: TreeNode },
  resolve: (data: TreeNode[]) => void,
) => Promise<void>

const ElTreeStub = defineComponent({
  props: {
    load: { type: Function as PropType<TreeLoader>, required: true },
    lazy: Boolean,
  },
  setup(props, { slots }) {
    const nodes = ref<TreeNode[]>([])
    onMounted(() => {
      void props.load({ level: 0 }, (data) => {
        nodes.value = data
      })
    })
    return () =>
      h(
        'div',
        { class: 'el-tree-stub', 'data-lazy': String(props.lazy) },
        nodes.value.map((data) =>
          h(
            'button',
            {
              class: 'el-tree-node-stub',
              'data-directory': String(data.directory),
              'data-leaf': String(data.isLeaf),
              type: 'button',
            },
            slots.default?.({ data }),
          ),
        ),
      )
  },
})

const Passthrough = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

function commandBlock(output: string): TerminalCommandBlock {
  return {
    id: 1,
    command: 'ls',
    output,
    startedAt: Date.now(),
    finishedAt: Date.now(),
    exitCode: 0,
    truncated: false,
  }
}

function mountGui(output: string): { app: App; host: HTMLDivElement } {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(TerminalGuiView, {
    blocks: [commandBlock(output)],
    sessionId: 'session-1',
  })
  app.provide(TERMINAL_TRANSLATE_KEY, translate)
  app.component('ElTree', ElTreeStub)
  for (const name of ['ElButton', 'ElIcon', 'ElTooltip']) app.component(name, Passthrough)
  app.mount(host)
  return { app, host }
}

async function flushUpdates(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

async function probeAndOpen(host: HTMLElement): Promise<void> {
  const candidate = host.querySelector('.command-block__path-candidate') as HTMLElement
  candidate.dispatchEvent(new MouseEvent('mouseenter'))
  await flushUpdates()
  ;(host.querySelector('.command-block__path') as HTMLAnchorElement).click()
  await flushUpdates()
}

describe('TerminalGuiView inline directory tree', () => {
  let mounted: { app: App; host: HTMLDivElement } | undefined

  beforeEach(() => {
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn() },
    })
  })

  afterEach(() => {
    mounted?.app.unmount()
    mounted = undefined
    document.body.innerHTML = ''
  })

  it('lists a detected directory through the shared lazy tree without reading it as a file', async () => {
    const unsafeName = '<img src=x onerror=alert(1)>'
    window.ipcRenderer.invoke = vi.fn((channel: string) => {
      if (channel === 'terminal-path-stat') {
        return Promise.resolve({
          exists: true,
          directory: true,
          resolvedPath: '/workspace/src',
          size: 0,
        })
      }
      if (channel === 'terminal-session-list-dir') {
        return Promise.resolve({
          resolvedPath: '/workspace/src',
          truncated: true,
          entries: [
            {
              name: 'nested',
              path: '/workspace/src/nested',
              directory: true,
              size: 0,
              modifiedAt: 0,
              mode: 0,
            },
            {
              name: unsafeName,
              path: '/workspace/src/unsafe',
              directory: false,
              size: 12,
              modifiedAt: 0,
              mode: 0,
            },
          ],
        })
      }
      return Promise.resolve(null)
    })
    mounted = mountGui('src/')

    await probeAndOpen(mounted.host)

    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith('terminal-session-list-dir', {
      sessionId: 'session-1',
      path: 'src/',
    })
    expect(window.ipcRenderer.invoke).not.toHaveBeenCalledWith(
      'terminal-path-read',
      expect.anything(),
    )
    expect(mounted.host.querySelector('.terminal-file-tree')).not.toBeNull()
    expect(mounted.host.querySelector('.el-tree-stub')?.getAttribute('data-lazy')).toBe('true')
    expect(mounted.host.querySelector('[data-directory="true"]')?.getAttribute('data-leaf')).toBe(
      'false',
    )
    expect(mounted.host.textContent).toContain(unsafeName)
    expect(mounted.host.textContent).toContain('common.terminal.fileTreeTruncated:2')
    expect(mounted.host.querySelector('img')).toBeNull()

    ;(mounted.host.querySelector('.command-block__path') as HTMLAnchorElement).click()
    await nextTick()
    expect(mounted.host.querySelector('.terminal-file-tree')).toBeNull()
  })

  it('keeps detected files on the existing bounded file-preview channel', async () => {
    window.ipcRenderer.invoke = vi.fn((channel: string) => {
      if (channel === 'terminal-path-stat') {
        return Promise.resolve({
          exists: true,
          directory: false,
          resolvedPath: '/workspace/readme.md',
          size: 10,
        })
      }
      return Promise.resolve(null)
    })
    mounted = mountGui('readme.md')

    await probeAndOpen(mounted.host)

    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith('terminal-path-read', {
      sessionId: 'session-1',
      path: 'readme.md',
      maxBytes: 512 * 1024,
    })
    expect(window.ipcRenderer.invoke).not.toHaveBeenCalledWith(
      'terminal-session-list-dir',
      expect.anything(),
    )
    expect(mounted.host.querySelector('.terminal-file-tree')).toBeNull()
  })
})
