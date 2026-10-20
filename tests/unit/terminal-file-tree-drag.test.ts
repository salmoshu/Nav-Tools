import { existsSync, readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  activateFileTreeDrag,
  beginFileTreePointerDrag,
  canDropFileTreeNode,
  completeFileTreeDragOutPrep,
  enterFileTreeDragOutPrep,
  exitFileTreeDragOutPrep,
  fileTreeDragExceededThreshold,
  FILE_TREE_DRAG_THRESHOLD_PX,
  finishFileTreeGesture,
  isFileTreePointerOutside,
  isNoopFileTreeMove,
  isSelfOrDescendant,
  joinFileTreePath,
  resolveFileTreeHitTarget,
  sanitizeDragTempName,
  setFileTreeGestureHover,
  trackFileTreePointer,
  type FileTreeDragPayload,
  type FileTreePointerGesture,
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

describe('canDropFileTreeNode(树内落点规则)', () => {
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

describe('isFileTreePointerOutside', () => {
  it('指针坐标越出窗口即判定拖出应用', () => {
    expect(isFileTreePointerOutside(-1, 100, 1000, 700)).toBe(true)
    expect(isFileTreePointerOutside(100, 701, 1000, 700)).toBe(true)
    expect(isFileTreePointerOutside(1001, 100, 1000, 700)).toBe(true)
    expect(isFileTreePointerOutside(100, 100, 1000, 700)).toBe(false)
    expect(isFileTreePointerOutside(1000, 700, 1000, 700)).toBe(false)
  })
})

const payload: FileTreeDragPayload = {
  sessionId: 's1',
  path: '/a/f.txt',
  name: 'f.txt',
  directory: false,
}

function newGesture(): FileTreePointerGesture {
  return beginFileTreePointerDrag(payload, 1, 100, 100)
}

describe('指针拖拽手势:激活阈值', () => {
  it('begin 后是 pending;阈值内移动不激活,松手结论是 click(点击行为不受影响)', () => {
    const g = newGesture()
    expect(g.phase).toBe('pending')
    trackFileTreePointer(g, 100 + FILE_TREE_DRAG_THRESHOLD_PX, 100)
    expect(fileTreeDragExceededThreshold(g)).toBe(false)
    expect(activateFileTreeDrag(g)).toBe(false)
    expect(g.phase).toBe('pending')
    expect(finishFileTreeGesture(g)).toEqual({ kind: 'click' })
  })

  it('位移超过阈值激活为 dragging;重复激活返回 false', () => {
    const g = newGesture()
    trackFileTreePointer(g, 100 + FILE_TREE_DRAG_THRESHOLD_PX + 1, 100)
    expect(activateFileTreeDrag(g)).toBe(true)
    expect(g.phase).toBe('dragging')
    expect(activateFileTreeDrag(g)).toBe(false)
  })
})

describe('resolveFileTreeHitTarget(命中判定规则)', () => {
  it('窗口外优先于一切应用内落点', () => {
    expect(
      resolveFileTreeHitTarget({
        insideWindow: false,
        paneId: 'p1',
        treeDir: { path: '/b', directory: true },
        draggingPath: '/a/f.txt',
      }),
    ).toEqual({ kind: 'outside' })
  })

  it('窗格优先于树内目录', () => {
    expect(
      resolveFileTreeHitTarget({
        insideWindow: true,
        paneId: 'p1',
        treeDir: { path: '/b', directory: true },
        draggingPath: '/a/f.txt',
      }),
    ).toEqual({ kind: 'pane', paneId: 'p1' })
  })

  it('树内目录命中要过落点规则:文件/自身/子孙都归为 none', () => {
    expect(
      resolveFileTreeHitTarget({
        insideWindow: true,
        treeDir: { path: '/b', directory: true },
        draggingPath: '/a/f.txt',
      }),
    ).toEqual({ kind: 'tree-dir', path: '/b' })
    expect(
      resolveFileTreeHitTarget({
        insideWindow: true,
        treeDir: { path: '/b/g.txt', directory: false },
        draggingPath: '/a/f.txt',
      }),
    ).toEqual({ kind: 'none' })
    expect(
      resolveFileTreeHitTarget({
        insideWindow: true,
        treeDir: { path: '/a/d/sub', directory: true },
        draggingPath: '/a/d',
      }),
    ).toEqual({ kind: 'none' })
  })
})

describe('指针拖拽手势:出窗准备与移交', () => {
  it('dragging 出窗 → preparing;回窗恢复 dragging;preparing 完成 → external', () => {
    const g = newGesture()
    trackFileTreePointer(g, 200, 100)
    activateFileTreeDrag(g)

    expect(enterFileTreeDragOutPrep(g)).toBe(true)
    expect(g.phase).toBe('preparing')
    // 重复出窗不重入
    expect(enterFileTreeDragOutPrep(g)).toBe(false)

    expect(exitFileTreeDragOutPrep(g)).toBe(true)
    expect(g.phase).toBe('dragging')

    expect(enterFileTreeDragOutPrep(g)).toBe(true)
    expect(completeFileTreeDragOutPrep(g)).toBe(true)
    expect(g.phase).toBe('external')
    // external 后松手结论是 noop:系统已接管
    expect(finishFileTreeGesture(g)).toEqual({ kind: 'noop' })
  })

  it('pending 不能直接进入 preparing;dragging 不能跳到 external', () => {
    const g = newGesture()
    expect(enterFileTreeDragOutPrep(g)).toBe(false)
    expect(completeFileTreeDragOutPrep(g)).toBe(false)
    trackFileTreePointer(g, 200, 100)
    activateFileTreeDrag(g)
    expect(completeFileTreeDragOutPrep(g)).toBe(false)
  })
})

describe('finishFileTreeGesture(松手结论)', () => {
  function draggingGesture(hover: Parameters<typeof setFileTreeGestureHover>[1]): FileTreePointerGesture {
    const g = newGesture()
    trackFileTreePointer(g, 200, 100)
    activateFileTreeDrag(g)
    setFileTreeGestureHover(g, hover)
    return g
  }

  it('树内目录落点 → move;窗格落点 → insert-path', () => {
    expect(finishFileTreeGesture(draggingGesture({ kind: 'tree-dir', path: '/b' }))).toEqual({
      kind: 'move',
      targetDirPath: '/b',
    })
    expect(finishFileTreeGesture(draggingGesture({ kind: 'pane', paneId: 'p1' }))).toEqual({
      kind: 'insert-path',
      paneId: 'p1',
    })
  })

  it('无效落点 → noop;出窗松手(未就绪) → arm-drag-out 降级', () => {
    expect(finishFileTreeGesture(draggingGesture({ kind: 'none' }))).toEqual({ kind: 'noop' })
    expect(finishFileTreeGesture(draggingGesture({ kind: 'outside' }))).toEqual({
      kind: 'arm-drag-out',
    })
    const g = draggingGesture({ kind: 'outside' })
    enterFileTreeDragOutPrep(g)
    expect(finishFileTreeGesture(g)).toEqual({ kind: 'arm-drag-out' })
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
  ).replace(/\r\n/g, '\n')
  const paneSource = readFileSync(
    'src/components/windows/common/TerminalPane.vue',
    'utf8',
  ).replace(/\r\n/g, '\n')
  const ipcSource = readFileSync('electron/main/terminalIpc.ts', 'utf8').replace(/\r\n/g, '\n')

  it('树改为自实现指针拖拽:不再用 el-tree draggable,改为 pointer 事件 + 命中判定', () => {
    expect(treeSource).not.toContain('draggable')
    expect(treeSource).not.toContain('allow-drop')
    expect(treeSource).not.toContain('@node-drop')
    expect(treeSource).toContain('@pointerdown="onTreePointerDown"')
    expect(treeSource).toContain('@pointermove="onTreePointerMove"')
    expect(treeSource).toContain('@pointerup="onTreePointerUp"')
    expect(treeSource).toContain('setPointerCapture')
    expect(treeSource).toContain('document.elementFromPoint')
    expect(treeSource).toContain('resolveFileTreeHitTarget')
    // 阈值内不捕获不拦截,单击/双击展开选择不受影响(阈值判定在状态机纯函数内)
    expect(treeSource).toContain('beginFileTreePointerDrag')
    expect(treeSource).toContain('activateFileTreeDrag')
    // 跟随光标的拖拽幽灵(文件名+图标,品牌蓝描边)
    expect(treeSource).toContain('file-tree-drag-ghost')
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

  it('终端窗格注册为指针手势落点:命中后按窗格 shell 家族转义插入路径', () => {
    expect(paneSource).not.toContain('@drop=')
    expect(paneSource).not.toContain('FILE_TREE_DRAG_MIME')
    expect(paneSource).toContain('registerFileTreePaneTarget')
    expect(paneSource).toContain('unregisterFileTreePaneTarget')
    expect(paneSource).toContain('quoteShellArg(payload.path, shellFamily.value)')
    expect(paneSource).toContain('file-tree-drop-target')
  })

  it('拖出应用:出窗下载到系统临时目录,按钮仍按住即经主进程 startDrag 同手势移交', () => {
    expect(treeSource).toContain("window.ipcRenderer.invoke('terminal-file-tree-drag-temp-path'")
    expect(treeSource).toContain("window.ipcRenderer.send('terminal-file-tree-start-drag'")
    expect(treeSource).toContain('completeFileTreeDragOutPrep')
    // 降级:出窗松手未就绪时武装缓存并提示「再拖一次」
    expect(treeSource).toContain('armAfterReleaseOutside')
    expect(treeSource).toContain('DRAG_OUT_ARM_MS')
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
        'fileTreeDragPreparing',
        'fileTreeDragOutCached',
      ]) {
        expect(source).toContain(`${key}:`)
      }
    }
  })
})
