import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  createPreviewTab,
  createTerminalTab,
  listTerminalPanes,
} from '../../src/core/terminal/TerminalLayout'
import { TerminalWorkspaceStorage } from '../../src/core/terminal/TerminalWorkspaceStorage'

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { dump: () => string | null } {
  let value: string | null = null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
    dump: () => value,
  }
}

describe('createPreviewTab', () => {
  it('预览 tab 记录目标并持有一个无会话空 pane', () => {
    const tab = createPreviewTab({ sessionId: 's1', path: '/var/log/app.log', name: 'app.log' })
    expect(tab.preview).toEqual({ sessionId: 's1', path: '/var/log/app.log', name: 'app.log' })
    expect(tab.title).toBe('app.log')
    // 空 pane 只是为了让 listTerminalPanes 等树型 helper 不必特判
    const panes = listTerminalPanes(tab.root)
    expect(panes).toHaveLength(1)
    expect(panes[0].sessionId).toBeUndefined()
    expect(tab.focusedPaneId).toBe(panes[0].id)
  })

  it('同会话同路径的查重由 preview 字段支撑', () => {
    const a = createPreviewTab({ sessionId: 's1', path: '/a.txt', name: 'a.txt' })
    const b = createPreviewTab({ sessionId: 's2', path: '/a.txt', name: 'a.txt' })
    expect(a.preview?.sessionId).not.toBe(b.preview?.sessionId)
  })
})

describe('TerminalWorkspaceStorage 预览 tab 过滤', () => {
  it('save 丢弃预览 tab;activeTabId 指向被丢弃 tab 时回退', () => {
    const storage = memoryStorage()
    const workspace = new TerminalWorkspaceStorage(storage)
    const normal = createTerminalTab('zsh')
    const preview = createPreviewTab({ sessionId: 's1', path: '/a.txt', name: 'a.txt' })
    workspace.save({ tabs: [normal, preview], activeTabId: preview.id })

    const saved = JSON.parse(storage.dump() || '') as {
      tabs: { id: string; preview?: unknown }[]
      activeTabId: string
    }
    expect(saved.tabs).toHaveLength(1)
    expect(saved.tabs[0].id).toBe(normal.id)
    expect(saved.activeTabId).toBe(normal.id)
  })

  it('全是预览 tab 时保存为空工作区,load 回退到默认新 tab', () => {
    const storage = memoryStorage()
    const workspace = new TerminalWorkspaceStorage(storage)
    const preview = createPreviewTab({ sessionId: 's1', path: '/a.txt', name: 'a.txt' })
    workspace.save({ tabs: [preview], activeTabId: preview.id })

    const loaded = workspace.load()
    expect(loaded.tabs).toHaveLength(1)
    expect(loaded.tabs[0].preview).toBeUndefined()
  })

  it('normalizeTab 防御性丢弃持久化数据里的未知 preview 字段', () => {
    const storage = memoryStorage()
    storage.setItem(
      'nav-tools:terminal-layout:v3',
      JSON.stringify({
        version: 3,
        activeTabId: 'tab-1',
        tabs: [
          {
            id: 'tab-1',
            title: 'a.txt',
            preview: { sessionId: 's1', path: '/a.txt', name: 'a.txt' },
            root: { kind: 'pane', id: 'pane-1', title: 'a.txt' },
            focusedPaneId: 'pane-1',
          },
        ],
      }),
    )
    const loaded = new TerminalWorkspaceStorage(storage).load()
    expect(loaded.tabs).toHaveLength(1)
    expect(loaded.tabs[0].preview).toBeUndefined()
  })
})

describe('文件预览 Tab 接线(源码扫描)', () => {
  const terminalSource = readFileSync('src/components/windows/common/Terminal.vue', 'utf8').replace(
    /\r\n/g,
    '\n',
  )
  const panelSource = readFileSync(
    'src/components/windows/common/TerminalFileTreePanel.vue',
    'utf8',
  ).replace(/\r\n/g, '\n')
  const previewSource = readFileSync(
    'src/components/windows/common/TerminalFilePreviewTab.vue',
    'utf8',
  ).replace(/\r\n/g, '\n')

  it('Terminal.vue:预览 tab 渲染分支、查重激活与面板接线', () => {
    expect(terminalSource).toContain('createPreviewTab')
    expect(terminalSource).toContain('openPreviewTab')
    expect(terminalSource).toContain(
      'tab.preview?.sessionId === sessionId && tab.preview.path === entry.path',
    )
    expect(terminalSource).toContain('v-if="activeTab.preview"')
    expect(terminalSource).toContain(
      ':session-active="Boolean(sessionInfos[activeTab.preview.sessionId])"',
    )
    expect(terminalSource).toContain('@open-file="handleFileTreeOpenFile"')
    // 预览 tab 不渲染会话状态点
    expect(terminalSource).toContain('v-if="!tab.preview"')
  })

  it('Terminal.vue:预览 tab 激活时文件树回退到预览会话并跟随文件所在目录', () => {
    // 预览 tab 无会话:computed 回退到 preview.sessionId,面板保持打开
    expect(terminalSource).toContain('tab.preview.sessionId')
    // 跟随:revealPath = 被预览文件的父目录,仅预览 tab 激活且会话匹配时提供
    expect(terminalSource).toContain(':reveal-path="activeFileTreeRevealPath"')
    expect(terminalSource).toContain('parentPathOf(preview.path)')
  })

  it('文件树面板:revealPath 驱动目录跟随;面板未打开时不会被强制打开', () => {
    expect(panelSource).toContain('revealPath?: string')
    expect(panelSource).toContain('() => props.revealPath')
    expect(panelSource).toContain('navigateToRoot')
  })

  it('文件树面板:点击文件向上抛 open-file,不再内嵌预览区', () => {
    expect(panelSource).toContain("'open-file': [entry: SftpEntry]")
    expect(panelSource).toContain("emit('open-file', data)")
    expect(panelSource).not.toContain('file-tree-preview')
    expect(panelSource).not.toContain('terminal-path-read')
    expect(panelSource).not.toContain('TerminalRichContent')
  })

  it('预览组件:terminal-path-read 读取 + 断会话空态 + 截断提示', () => {
    expect(previewSource).toContain("window.ipcRenderer.invoke('terminal-path-read'")
    expect(previewSource).toContain('TerminalRichContent')
    expect(previewSource).toContain("t('common.terminal.filePreviewSessionGone')")
    expect(previewSource).toContain("t('common.terminal.guiPreviewTruncated')")
    expect(previewSource).toContain('!sessionActive')
  })
})
