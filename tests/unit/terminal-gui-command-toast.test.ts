/* eslint-disable vue/one-component-per-file -- 测试宿主与 Element Plus 桩集中在同一文件便于复用 */
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalCommandBlock } from '@/core/terminal/CommandBlocks'
import { TERMINAL_TRANSLATE_KEY, type TerminalTranslate } from '@/core/terminal/TerminalI18n'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), info: vi.fn() },
}))

import { ElMessage } from 'element-plus'
import TerminalGuiView from '../../src/components/windows/common/TerminalGuiView.vue'

/** 简易插值:具名参数直接拼接(key 本身不含占位符),让 toast 文案可被断言 */
const translate: TerminalTranslate = (key, named) =>
  named ? `${key}:${Object.values(named).map(value => String(value)).join(' | ')}` : key

const Passthrough = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

/** 复现用户场景:exit 126 的 build.sh 失败命令块 */
function buildScriptBlock(id: number, finished: boolean): TerminalCommandBlock {
  const base: TerminalCommandBlock = {
    id,
    command: './Scripts/build.sh Release -j 4',
    output: 'permission denied',
    startedAt: 1,
    truncated: false,
    exitCode: finished ? 126 : undefined,
  }
  return finished ? { ...base, finishedAt: 2 } : base
}

/** 响应式宿主:挂载后再改 blocks/cwd,模拟切 tab 回来 attachSession 异步恢复 scrollback 的时序 */
function mountGui() {
  const blocks = ref<TerminalCommandBlock[]>([])
  const cwd = ref<string | undefined>(undefined)
  const host = document.createElement('div')
  document.body.append(host)
  const Host = defineComponent({
    setup() {
      return () =>
        h(TerminalGuiView, { blocks: blocks.value, cwd: cwd.value, sessionId: 'session-1' })
    },
  })
  const app = createApp(Host)
  app.provide(TERMINAL_TRANSLATE_KEY, translate)
  app.component('ElTree', Passthrough)
  for (const name of ['ElButton', 'ElIcon', 'ElTooltip']) app.component(name, Passthrough)
  app.mount(host)
  return { app, host, blocks, cwd }
}

async function flushUpdates(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('TerminalGuiView 完成注意力 toast', () => {
  let mounted: ReturnType<typeof mountGui> | undefined

  beforeEach(() => {
    vi.mocked(ElMessage.error).mockClear()
    vi.mocked(ElMessage.info).mockClear()
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

  it('挂载后恢复的历史失败块不补发 toast(切 tab 重挂载不再重复报错)', async () => {
    mounted = mountGui()
    await flushUpdates()

    // attachSession 异步完成后整段 scrollback 一次性灌入:块首次见到即为已完成
    mounted.blocks.value = [buildScriptBlock(1, true)]
    await flushUpdates()

    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('本视图存活期间未完成转为失败的命令块照常 toast 一次', async () => {
    mounted = mountGui()
    await flushUpdates()

    mounted.blocks.value = [buildScriptBlock(1, false)]
    await flushUpdates()
    expect(ElMessage.error).not.toHaveBeenCalled()

    mounted.blocks.value = [buildScriptBlock(1, true)]
    await flushUpdates()
    expect(ElMessage.error).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).toHaveBeenCalledWith(
      expect.stringContaining('./Scripts/build.sh Release -j 4'),
    )

    // 后续 props 重放(新数组新对象)不再重复弹
    mounted.blocks.value = [{ ...buildScriptBlock(1, true) }]
    await flushUpdates()
    expect(ElMessage.error).toHaveBeenCalledTimes(1)
  })

  it('块列表清空(会话切换)后恢复的历史完成块同样不补发', async () => {
    mounted = mountGui()
    await flushUpdates()

    mounted.blocks.value = [buildScriptBlock(1, false)]
    await flushUpdates()
    mounted.blocks.value = []
    await flushUpdates()
    mounted.blocks.value = [buildScriptBlock(1, true)]
    await flushUpdates()

    expect(ElMessage.error).not.toHaveBeenCalled()
  })
})

describe('TerminalGuiView 输入行工作目录展示', () => {
  let mounted: ReturnType<typeof mountGui> | undefined

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

  async function cwdText(): Promise<{ text: string; title: string | null }> {
    await flushUpdates()
    const el = mounted!.host.querySelector('.gui-input-row__cwd') as HTMLElement | null
    return { text: el?.textContent ?? '', title: el?.getAttribute('title') ?? null }
  }

  it('剥离 OSC 7 的多字符 host 前缀,仅展示路径', async () => {
    mounted = mountGui()
    mounted.cwd.value = 'LAPTOP-P70CKHGG:/mnt/e/Proj/work'
    const { text, title } = await cwdText()
    expect(text).toBe('/mnt/e/Proj/work')
    expect(title).toBe('LAPTOP-P70CKHGG:/mnt/e/Proj/work')
  })

  it('Windows 盘符路径与 ~ 家目录缩写不受影响', async () => {
    mounted = mountGui()
    mounted.cwd.value = 'E:\\work\\nav'
    expect((await cwdText()).text).toBe('E:\\work\\nav')

    mounted.cwd.value = 'C:/Users/salmos'
    expect((await cwdText()).text).toBe('C:/Users/salmos')

    mounted.cwd.value = '~/project'
    expect((await cwdText()).text).toBe('~/project')

    mounted.cwd.value = 'pi:~/project'
    expect((await cwdText()).text).toBe('~/project')
  })
})
