/* eslint-disable vue/one-component-per-file -- 复用 inline-file-tree 测试的宿主模式 */
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
        { class: 'el-tree-stub' },
        nodes.value.map((data) =>
          h('button', { class: 'el-tree-node-stub' }, slots.default?.({ data })),
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
    command: 'pwd',
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
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('TerminalGuiView Windows 路径点击预览(用户现场复现)', () => {
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

  it('PowerShell pwd 输出里的 C:\\ 目录,悬停确认后点击应展开目录树', async () => {
    const output = 'Path\r\n----\r\nC:\\Users\\winch\r\n'
    window.ipcRenderer.invoke = vi.fn((channel: string) => {
      if (channel === 'terminal-path-stat') {
        return Promise.resolve({
          exists: true,
          directory: true,
          resolvedPath: 'C:\\Users\\winch',
          size: 0,
        })
      }
      if (channel === 'terminal-session-list-dir') {
        return Promise.resolve({
          resolvedPath: 'C:\\Users\\winch',
          truncated: false,
          entries: [
            {
              name: 'Desktop',
              path: 'C:\\Users\\winch\\Desktop',
              directory: true,
              size: 0,
              modifiedAt: 0,
              mode: 0,
            },
          ],
        })
      }
      return Promise.resolve(null)
    })
    mounted = mountGui(output)

    await flushUpdates()
    const candidate = mounted.host.querySelector('.command-block__path-candidate') as HTMLElement
    expect(candidate, '候选段应存在(未确认前)').not.toBeNull()
    expect(candidate.textContent).toBe('C:\\Users\\winch')

    candidate.dispatchEvent(new MouseEvent('mouseenter'))
    await flushUpdates()

    const link = mounted.host.querySelector('.command-block__path') as HTMLAnchorElement
    expect(link, '确认存在后应渲染为链接').not.toBeNull()

    link.click()
    await flushUpdates()

    const preview = mounted.host.querySelector('.command-block__preview')
    expect(preview, '点击后应出现块内预览').not.toBeNull()
    expect(mounted.host.querySelector('.terminal-file-tree')).not.toBeNull()
    expect(mounted.host.textContent).toContain('Desktop')
  })
})
