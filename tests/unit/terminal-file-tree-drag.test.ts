import { existsSync, readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  FILE_TREE_DRAG_MIME,
  beginFileTreeDrag,
  canDropFileTreeNode,
  endFileTreeDrag,
  isNoopFileTreeMove,
  isOutsideWindow,
  isSelfOrDescendant,
  joinFileTreePath,
  markFileTreeDragHandled,
  sanitizeDragTempName,
} from '../../src/core/terminal/FileTreeDrag'

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), isPackaged: false },
}))

import { TerminalService } from '../../electron/main/services/TerminalService'
import { createNodeTerminalServiceHost } from '../../electron/main/services/TerminalServiceHost'

describe('joinFileTreePath', () => {
  it('按目标目录自身的分隔符风格拼接,根目录不重复分隔符', () => {
    expect(joinFileTreePath('/var/log', 'a.txt')).toBe('/var/log/a.txt')
    expect(joinFileTreePath('/var/log/', 'a.txt')).toBe('/var/log/a.txt')
    expect(joinFileTreePath('/', 'a.txt')).toBe('/a.txt')
    expect(joinFileTreePath('C:\\data', 'a.txt')).toBe('C:\\data\\a.txt')
    expect(joinFileTreePath('C:\\', 'a.txt')).toBe('C:\\a.txt')
  })
})

describe('isSelfOrDescendant', () => {
  it('自身与子孙命中,兄弟/父级/前缀相似目录不命中', () => {
    expect(isSelfOrDescendant('/a', '/a')).toBe(true)
    expect(isSelfOrDescendant('/a', '/a/b')).toBe(true)
    expect(isSelfOrDescendant('/a', '/a/b/c')).toBe(true)
    expect(isSelfOrDescendant('/a', '/ab')).toBe(false)
    expect(isSelfOrDescendant('/a', '/')).toBe(false)
    expect(isSelfOrDescendant('C:\\a', 'C:\\a\\b')).toBe(true)
    expect(isSelfOrDescendant('C:\\a', 'C:\\ab')).toBe(false)
  })
})

describe('canDropFileTreeNode(el-tree allow-drop 规则)', () => {
  const dir = (p: string) => ({ path: p, directory: true })
  const file = (p: string) => ({ path: p, directory: false })

  it('只允许 inner 落入目录;prev/next 一律拒绝', () => {
    expect(canDropFileTreeNode(file('/a/f.txt'), dir('/b'), 'inner')).toBe(true)
    expect(canDropFileTreeNode(dir('/a/d'), dir('/b'), 'inner')).toBe(true)
    expect(canDropFileTreeNode(file('/a/f.txt'), dir('/b'), 'prev')).toBe(false)
    expect(canDropFileTreeNode(dir('/a/d'), dir('/b'), 'next')).toBe(false)
  })

  it('禁止落入文件、自身与子孙', () => {
    expect(canDropFileTreeNode(file('/a/f.txt'), file('/b/g.txt'), 'inner')).toBe(false)
    expect(canDropFileTreeNode(dir('/a/d'), dir('/a/d'), 'inner')).toBe(false)
    expect(canDropFileTreeNode(dir('/a/d'), dir('/a/d/sub'), 'inner')).toBe(false)
  })
})

describe('isNoopFileTreeMove', () => {
  it('目标目录就是源所在目录时为无操作', () => {
    expect(isNoopFileTreeMove('/a/f.txt', 'f.txt', '/a')).toBe(true)
    expect(isNoopFileTreeMove('/a/f.txt', 'f.txt', '/b')).toBe(false)
  })
})

describe('sanitizeDragTempName', () => {
  it('替换 Windows 非法字符、结尾点/空格;全非法时兜底', () => {
    expect(sanitizeDragTempName('a:b*c?.txt')).toBe('a_b_c_.txt')
    expect(sanitizeDragTempName('with\\slash')).toBe('with_slash')
    expect(sanitizeDragTempName('name...  ')).toBe('name')
    expect(sanitizeDragTempName('...')).toBe('_')
  })
})

describe('isOutsideWindow', () => {
  it('dragend 坐标越出窗口才算拖出应用', () => {
    expect(isOutsideWindow(-1, 100, 1000, 700)).toBe(true)
    expect(isOutsideWindow(100, 701, 1000, 700)).toBe(true)
    expect(isOutsideWindow(1001, 100, 1000, 700)).toBe(true)
    expect(isOutsideWindow(100, 100, 1000, 700)).toBe(false)
    expect(isOutsideWindow(1000, 700, 1000, 700)).toBe(false)
  })
})

describe('跨组件拖拽手势状态', () => {
  it('begin/mark/end 闭环,end 后状态清空', () => {
    const gesture = beginFileTreeDrag({
      sessionId: 's1',
      path: '/a',
      name: 'a',
      directory: false,
    })
    expect(gesture.handledInApp).toBe(false)
    markFileTreeDragHandled()
    expect(gesture.handledInApp).toBe(true)
    expect(endFileTreeDrag()).toBe(gesture)
    expect(endFileTreeDrag()).toBeNull()
  })
})

describe('renameSessionPath 作为移动(本机通道)', () => {
  it('把文件移进子目录,内容不变', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-move-'))
    const service = new TerminalService(os.tmpdir(), () => {}, createNodeTerminalServiceHost())
    const session = {
      type: 'pty',
      info: { id: 'local-move', kind: 'local', title: 't', status: 'ready', cwd: dir },
      scrollback: '',
      oscTail: '',
      request: { kind: 'local', cols: 80, rows: 24 },
    }
    ;(service as unknown as { sessions: Map<string, unknown> }).sessions.set('local-move', session)
    try {
      await fs.mkdir(path.join(dir, 'sub'))
      await fs.writeFile(path.join(dir, 'mv.txt'), 'payload')

      await service.renameSessionPath('local-move', 'mv.txt', 'sub/mv.txt')

      await expect(fs.readFile(path.join(dir, 'sub', 'mv.txt'), 'utf8')).resolves.toBe('payload')
      expect(existsSync(path.join(dir, 'mv.txt'))).toBe(false)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('文件树拖拽接线(源码扫描)', () => {
  const treeSource = readFileSync(
    'src/components/windows/common/TerminalFileTree.vue',
    'utf8',
  ).replace(/\\r\\n/g, '\\n')
  const paneSource = readFileSync(
    'src/components/windows/common/TerminalPane.vue',
    'utf8',
  ).replace(/\\r\\n/g, '\\n')
  const ipcSource = readFileSync('electron/main/terminalIpc.ts', 'utf8').replace(/\\r\\n/g, '\\n')

  it('el-tree 开启 draggable 并接 allow-drop/node-drop/drag 事件', () => {
    expect(treeSource).toContain('draggable')
    expect(treeSource).toContain(':allow-drop="allowTreeDrop"')
    expect(treeSource).toContain('@node-drop="onNodeDrop"')
    expect(treeSource).toContain('@node-drag-start="onNodeDragStart"')
    expect(treeSource).toContain('@node-drag-end="onNodeDragEnd"')
    expect(treeSource).toContain('canDropFileTreeNode')
    // 拖拽态品牌蓝高亮目标目录
    expect(treeSource).toContain('is-drop-inner')
    expect(treeSource).toContain('terminal-file-tree__tree--dragging')
  })

  it('树内移动复用三通道 rename IPC,覆盖前 ElMessageBox 确认', () => {
    expect(treeSource).toContain("window.ipcRenderer.invoke('terminal-session-rename'")
    expect(treeSource).toContain("window.ipcRenderer.invoke('terminal-path-stat'")
    expect(treeSource).toContain("t('common.terminal.fileTreeMoveOverwriteConfirm'")
    expect(treeSource).toContain('remapExpandedPrefix')
  })

  it('终端窗格接受文件树拖拽并插入转义后的路径', () => {
    expect(paneSource).toContain('FILE_TREE_DRAG_MIME')
    expect(paneSource).toContain('@drop="onFileTreeDrop"')
    expect(paneSource).toContain('quoteShellArg(payload.path, shellFamily.value)')
    expect(paneSource).toContain('markFileTreeDragHandled()')
    expect(paneSource).toContain('file-tree-drop-target')
  })

  it('拖出应用:先下载到系统临时目录,再经主进程 startDrag;只放行临时缓存路径', () => {
    expect(treeSource).toContain("window.ipcRenderer.invoke('terminal-file-tree-drag-temp-path'")
    expect(treeSource).toContain("window.ipcRenderer.send('terminal-file-tree-start-drag'")
    expect(ipcSource).toContain("ipcMain.on('terminal-file-tree-start-drag'")
    expect(ipcSource).toContain('event.sender.startDrag({ file, icon: fileTreeDragIcon() })')
    expect(ipcSource).toContain('dragTempRoot() + path.sep')
    expect(ipcSource).toContain('sanitizeDragTempName')
  })

  it('i18n 新键 zh-CN / en-US 同步', () => {
    for (const locale of ['zh-CN', 'en-US']) {
      const source = readFileSync(`src/i18n/locales/${locale}/common.ts`, 'utf8')
      for (const key of [
        'fileTreeMove',
        'fileTreeMoveDone',
        'fileTreeMoveOverwriteConfirm',
        'fileTreeDragOutReady',
      ]) {
        expect(source).toContain(`${key}:`)
      }
    }
  })
})
