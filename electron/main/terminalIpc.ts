import { chooseOpenDirectory, chooseOpenFiles, showScopedSaveDialog } from './dialogs'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, app, ipcMain, nativeImage, shell, type NativeImage } from 'electron'
import type {
  PortForwardRule,
  SshConnectionProfile,
  SshConnectionSecrets,
  TerminalCreateRequest,
} from '../../src/core/terminal/TerminalTypes'
import { sanitizeDragTempName } from '../../src/core/terminal/FileTreeDrag'
import type { TerminalCredentialService } from './services/TerminalCredentialService'
import type { TerminalService } from './services/TerminalService'

export function registerTerminalIpc(
  service: TerminalService,
  credentials: TerminalCredentialService,
): void {
  ipcMain.handle('terminal-capabilities', () => service.getCapabilities())
  ipcMain.handle('terminal-session-list', () => service.listSessions())
  ipcMain.handle('terminal-session-attach', (_event, sessionId: string) =>
    service.attach(sessionId),
  )
  ipcMain.handle('terminal-session-create', (_event, request: TerminalCreateRequest) =>
    service.create(request),
  )
  ipcMain.handle('terminal-session-create-cancel', (_event, requestId: string) =>
    service.cancelCreate(requestId),
  )
  ipcMain.handle(
    'terminal-session-clone',
    (_event, request: { sessionId: string; cols: number; rows: number }) =>
      service.clone(request.sessionId, request.cols, request.rows),
  )
  ipcMain.handle('terminal-session-write', (_event, request: { sessionId: string; data: string }) =>
    service.write(request.sessionId, request.data),
  )
  ipcMain.handle(
    'terminal-session-resize',
    (_event, request: { sessionId: string; cols: number; rows: number }) =>
      service.resize(request.sessionId, request.cols, request.rows),
  )
  ipcMain.handle('terminal-session-close', (_event, sessionId: string) => service.close(sessionId))
  ipcMain.handle('terminal-session-close-all', () => service.closeAll())
  ipcMain.handle(
    'terminal-host-key-response',
    (_event, request: { requestId: string; accepted: boolean }) =>
      service.respondToHostKey(request.requestId, request.accepted),
  )
  ipcMain.handle('terminal-ssh-config-list', () => service.listSshConfigProfiles())
  ipcMain.handle('terminal-credential-load', (_event, profileId: string) =>
    credentials.load(profileId),
  )
  ipcMain.handle(
    'terminal-credential-save',
    (_event, request: { profileId: string; secrets: SshConnectionSecrets }) =>
      credentials.save(request.profileId, request.secrets),
  )
  ipcMain.handle('terminal-credential-remove', (_event, profileId: string) =>
    credentials.remove(profileId),
  )

  ipcMain.handle('terminal-sftp-list', (_event, request: { sessionId: string; path: string }) =>
    service.listSftp(request.sessionId, request.path),
  )
  ipcMain.handle('terminal-sftp-stat', (_event, request: { sessionId: string; path: string }) =>
    service.sftpStat(request.sessionId, request.path),
  )
  ipcMain.handle('terminal-sftp-mkdir', (_event, request: { sessionId: string; path: string }) =>
    service.sftpMkdir(request.sessionId, request.path),
  )
  ipcMain.handle(
    'terminal-sftp-rename',
    (_event, request: { sessionId: string; oldPath: string; newPath: string }) =>
      service.sftpRename(request.sessionId, request.oldPath, request.newPath),
  )
  ipcMain.handle('terminal-sftp-remove', (_event, request: { sessionId: string; path: string }) =>
    service.sftpRemove(request.sessionId, request.path),
  )
  ipcMain.handle('terminal-sftp-choose-upload', async (event) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    return (await chooseOpenFiles(target, 'terminal-upload', { multi: true })) ?? []
  })
  ipcMain.handle(
    'terminal-sftp-upload',
    (_event, request: { sessionId: string; localPaths: string[]; remoteDirectory: string }) =>
      service.sftpUpload(request.sessionId, request.localPaths, request.remoteDirectory),
  )
  ipcMain.handle(
    'terminal-sftp-choose-download',
    async (event, request: { name: string; directory: boolean }) => {
      const target = BrowserWindow.fromWebContents(event.sender)
      if (request.directory) {
        // 目录下载:filePath 即最终落盘目录(defaultPath 已含目录名),再拼一层会出 name\name
        const result = await showScopedSaveDialog(target, 'terminal-download', {
          defaultPath: request.name,
        })
        return result.canceled || !result.filePath ? null : result.filePath
      }
      const result = await showScopedSaveDialog(target, 'terminal-download', {
        defaultPath: request.name,
      })
      return result.canceled ? null : result.filePath
    },
  )
  ipcMain.handle(
    'terminal-sftp-download',
    (_event, request: { sessionId: string; remotePath: string; localPath: string }) =>
      service.sftpDownload(request.sessionId, request.remotePath, request.localPath),
  )
  // 文件树下载:本机/WSL/SSH 按会话语义解析路径后统一落盘
  ipcMain.handle(
    'terminal-session-download',
    (_event, request: { sessionId: string; sessionPath: string; localPath: string }) =>
      service.downloadSessionPath(request.sessionId, request.sessionPath, request.localPath),
  )

  // 输出里的路径候选:先确认存在性,再按上限读取内容做块内预览
  ipcMain.handle(
    'terminal-path-stat',
    (_event, request: { sessionId: string; path: string }) =>
      service.statSessionPath(request.sessionId, request.path),
  )
  ipcMain.handle(
    'terminal-path-read',
    (_event, request: { sessionId: string; path: string; maxBytes?: number }) =>
      service.readSessionPath(request.sessionId, request.path, request.maxBytes),
  )

  // GUI 输出里的 http(s) 链接:交给系统默认浏览器;其他 scheme(file: 等)不放行
  ipcMain.handle('terminal-open-external', (_event, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false
    void shell.openExternal(url)
    return true
  })

  // 预设命令:主进程按会话自己的 shell 家族转义参数值后再写入,渲染层不参与转义
  ipcMain.handle(
    'terminal-session-run-command',
    (_event, request: {
      sessionId: string
      command: string
      cwd?: string
      values?: Record<string, string>
    }) =>
      service.runSessionCommand(request.sessionId, {
        command: request.command,
        cwd: request.cwd,
        values: request.values,
      }),
  )

  // 文件树面板:按会话类型列目录(本机/WSL/SSH 三通道)
  ipcMain.handle(
    'terminal-session-list-dir',
    (_event, request: { sessionId: string; path: string }) =>
      service.listSessionPath(request.sessionId, request.path),
  )
  // 文件树重命名/删除:与列目录、下载共用同一套会话三通道分发
  ipcMain.handle(
    'terminal-session-rename',
    (_event, request: { sessionId: string; oldPath: string; newPath: string }) =>
      service.renameSessionPath(request.sessionId, request.oldPath, request.newPath),
  )
  ipcMain.handle(
    'terminal-session-delete',
    (_event, request: { sessionId: string; path: string; directory: boolean }) =>
      service.deleteSessionPath(request.sessionId, request.path, request.directory),
  )

  ipcMain.handle(
    'terminal-forward-start',
    (_event, request: { sessionId: string; rule: PortForwardRule }) =>
      service.startForward(request.sessionId, request.rule),
  )
  ipcMain.handle(
    'terminal-forward-stop',
    (_event, request: { sessionId: string; ruleId: string }) =>
      service.stopForward(request.sessionId, request.ruleId),
  )

  ipcMain.handle('terminal-private-key-select', async (event) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    const result = await chooseOpenFiles(target, 'terminal-ssh-key', {
      filters: [{ name: 'SSH Private Key', extensions: ['pem', 'key', 'ppk', '*'] }],
    })
    return result?.[0] ?? null
  })

  // 文件树拖出应用:远端文件先下载到系统临时目录,再经 webContents.startDrag 发起系统级拖拽。
  // startDrag 依赖调用时鼠标仍处于按住状态;渲染层的指针手势在出窗后异步下载,
  // 下载完成时按键仍按住即同一手势移交 OLE;已松开则武装缓存、提示「再拖一次」兜底。
  const dragTempRoot = () => path.join(app.getPath('temp'), 'navtools-drag')
  // 启动时清掉上次运行的拖出缓存,避免把过期内容拖出去
  void fs.rm(dragTempRoot(), { recursive: true, force: true }).catch(() => undefined)
  let dragIcon: NativeImage | undefined
  const fileTreeDragIcon = (): NativeImage => {
    if (dragIcon) return dragIcon
    const candidate = path.join(app.getAppPath(), 'public', 'logo_transparent.png')
    const image = nativeImage.createFromPath(candidate)
    dragIcon = image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 32 })
    return dragIcon
  }
  ipcMain.handle(
    'terminal-file-tree-drag-temp-path',
    async (_event, request: { sessionId: string; name: string }) => {
      const dir = path.join(dragTempRoot(), request.sessionId)
      await fs.mkdir(dir, { recursive: true })
      return path.join(dir, sanitizeDragTempName(request.name))
    },
  )
  ipcMain.on('terminal-file-tree-start-drag', (event, request: { path?: string }) => {
    const file = typeof request?.path === 'string' ? request.path : ''
    // 只放行本功能生成的临时缓存,避免任意本地路径被拖出
    if (!file.startsWith(dragTempRoot() + path.sep)) return
    if (!existsSync(file)) return
    hideDragOverlay()
    event.sender.startDrag({ file, icon: fileTreeDragIcon() })
  })
  // 文件树多选批量下载:一次选一个目标目录,各条目以原名逐个落入
  ipcMain.handle('terminal-sftp-choose-download-dir', async (event) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    return chooseOpenDirectory(target, 'terminal-download')
  })

  // —— 拖出未就绪时的系统级跟随浮层 ——
  // OLE 拖放要求本地文件已存在,文件仍在下载时无法移交;
  // 用置顶小窗跟随光标显示「正在准备」,维持"手上有文件"的拖拽感,
  // 就绪后同手势移交 startDrag 并关闭浮层。浮层不抢焦点、不进任务栏。
  let dragOverlay: BrowserWindow | null = null
  const hideDragOverlay = (): void => {
    if (dragOverlay && !dragOverlay.isDestroyed()) dragOverlay.destroy()
    dragOverlay = null
  }
  const DRAG_OVERLAY_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  const dragOverlayHtml = (name: string): string => {
    const safe = name.replace(/[&<>"']/g, (ch) => DRAG_OVERLAY_ESCAPES[ch] ?? ch)
    return (
      '<!doctype html><html><head><meta charset="utf-8"><style>' +
      'html,body{margin:0;background:transparent;overflow:hidden}' +
      '.card{display:flex;align-items:center;gap:8px;height:32px;margin:4px;padding:0 10px;' +
      'border:1px solid #1783FF;border-radius:8px;background:rgba(255,255,255,.94);' +
      'box-shadow:0 6px 18px rgba(23,131,255,.25);' +
      'font:12px/1 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#1f2328}' +
      '.spin{width:12px;height:12px;flex:none;border:2px solid rgba(23,131,255,.25);' +
      'border-top-color:#1783FF;border-radius:50%;animation:sp .7s linear infinite}' +
      '@keyframes sp{to{transform:rotate(360deg)}}' +
      '.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}' +
      '</style></head><body><div class="card"><span class="spin"></span><span class="name">' +
      safe +
      '</span></div></body></html>'
    )
  }
  ipcMain.on(
    'terminal-file-tree-drag-overlay',
    (
      _event,
      request: { action?: string; x?: number; y?: number; name?: string },
    ) => {
      if (!request || typeof request !== 'object') return
      if (request.action === 'hide') {
        hideDragOverlay()
        return
      }
      const x = typeof request.x === 'number' ? Math.round(request.x) : 0
      const y = typeof request.y === 'number' ? Math.round(request.y) : 0
      if (request.action === 'show') {
        hideDragOverlay()
        const win = new BrowserWindow({
          width: 240,
          height: 40,
          useContentSize: true,
          frame: false,
          transparent: true,
          resizable: false,
          movable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          skipTaskbar: true,
          focusable: false,
          show: false,
          alwaysOnTop: true,
          webPreferences: { sandbox: true, contextIsolation: true },
        })
        dragOverlay = win
        win.setAlwaysOnTop(true, 'screen-saver')
        win.on('closed', () => {
          if (dragOverlay === win) dragOverlay = null
        })
        win.once('ready-to-show', () => {
          if (win.isDestroyed()) return
          win.setPosition(x + 14, y + 16)
          win.showInactive()
        })
        void win.loadURL(
          'data:text/html;charset=utf-8,' +
            encodeURIComponent(dragOverlayHtml(String(request.name ?? ''))),
        )
        return
      }
      if (request.action === 'move' && dragOverlay && !dragOverlay.isDestroyed()) {
        dragOverlay.setPosition(x + 14, y + 16)
      }
    },
  )

}

// Compile-time assertion that renderer and main share the same profile shape.
void ({} as SshConnectionProfile)
