import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  shell,
  ipcMain,
  Menu,
  powerSaveBlocker,
  safeStorage,
  screen,
  type Rectangle,
} from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import ffmpegStatic from 'ffmpeg-static'
import {
  eventsMap,
  iapUpgradeService,
  cameraCalibrationService,
  setCameraStreamServiceRef,
} from './events'
import { registerCameraCalibrationIpc } from './cameraCalibrationIpc'
import { registerCameraScriptIpc } from './cameraScriptIpc'
import { registerLidarIpc } from './lidarIpc'
import { registerGnssRawIpc } from './gnssRawIpc'
import { CameraMeasurementAccessStore } from './services/CameraMeasurementAccessStore'
import { CameraScriptInjector } from './services/CameraScriptInjector'
import { CameraStreamService } from './services/CameraStreamService'
import { FilePlaybackService } from './services/FilePlaybackService'
import { TextFileStreamService } from './services/TextFileStreamService'
import { LogRecordingService } from './services/LogRecordingService'
import { OfflineTileService } from './services/OfflineTileService'
import { UpdateService } from './services/UpdateService'
import { TerminalService } from './services/TerminalService'
import { createNodeTerminalServiceHost } from './services/TerminalServiceHost'
import { TerminalCredentialService } from './services/TerminalCredentialService'
import { registerTerminalIpc } from './terminalIpc'
import { createDesktopShortcut, parseOpenComponentArg, sanitizeShortcutName } from './shortcuts'
import { getPanelById } from '../../src/core/panels/registry'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 读取 package.json 获取版本号
const pkg = require('../../package.json')
const appVersion = pkg.version || 'unknown'

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST
process.env.VITE_PUBLIC = VITE_PUBLIC

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

let win: BrowserWindow | null = null
/**
 * 桌面快捷方式冷启动标志:主窗口因 --open-component 隐藏创建。
 * 此状态下最后一个组件窗口关闭即退出应用,不在后台残留隐藏进程;
 * 主窗口被显式唤出(second-instance 无组件参数)后恢复常规模型。
 */
let mainWindowHiddenForShortcut = false
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
const ffmpegExecutable = (ffmpegStatic || 'ffmpeg').replace(
  /app\.asar(?=[\\/])/,
  'app.asar.unpacked',
)
const cameraStreamService = new CameraStreamService(ffmpegExecutable)
setCameraStreamServiceRef(cameraStreamService)
const filePlaybackService = new FilePlaybackService()
const textFileStreamService = new TextFileStreamService()
const logRecordingService = new LogRecordingService()
const offlineTileService = new OfflineTileService()
const updateService = new UpdateService()
const terminalService = new TerminalService(
  app.getPath('userData'),
  (channel, payload) => {
    for (const target of BrowserWindow.getAllWindows()) {
      if (!target.isDestroyed()) target.webContents.send(channel, payload)
    }
  },
  createNodeTerminalServiceHost(),
)
const terminalCredentialService = new TerminalCredentialService(
  app.getPath('userData'),
  safeStorage,
)
registerTerminalIpc(terminalService, terminalCredentialService)
const cameraMeasurementStore = new CameraMeasurementAccessStore(app.getPath('userData'))
registerCameraCalibrationIpc(cameraCalibrationService, cameraMeasurementStore)
registerCameraScriptIpc(new CameraScriptInjector(), cameraMeasurementStore)
registerLidarIpc()
registerGnssRawIpc()
// 自定义瓦片协议必须在 app ready 之前注册为 privileged scheme
offlineTileService.registerPrivilegedScheme()
const cameraStreamOwners = new Set<number>()
const filePlaybackOwners = new Set<number>()
const textFileStreamOwners = new Set<number>()
const logRecordingOwners = new Set<number>()

type WindowResizeEdge =
  'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
const resizeIntervals = new Map<number, ReturnType<typeof setInterval>>()
interface DetachedPanel {
  originWebContentsId: number
  windowId: string
  componentName?: string
  closeInProgress?: boolean
  closeConfirmed?: boolean
}

const detachedPanels = new Map<number, DetachedPanel>()

function getWindowState(target: BrowserWindow) {
  return {
    maximized: target.isMaximized(),
    alwaysOnTop: target.isAlwaysOnTop(),
  }
}

function sendWindowState(target: BrowserWindow) {
  if (!target.webContents.isDestroyed()) {
    target.webContents.send('window-state-changed', getWindowState(target))
  }
}

function configureWebTitleBar(target: BrowserWindow) {
  target.on('maximize', () => sendWindowState(target))
  target.on('unmaximize', () => sendWindowState(target))
  target.on('enter-full-screen', () => sendWindowState(target))
  target.on('leave-full-screen', () => sendWindowState(target))
}

function stopWindowResize(webContentsId: number) {
  const interval = resizeIntervals.get(webContentsId)
  if (interval) clearInterval(interval)
  resizeIntervals.delete(webContentsId)
}

ipcMain.handle('window-get-state', (event) => {
  const target = BrowserWindow.fromWebContents(event.sender)
  return target ? getWindowState(target) : { maximized: false, alwaysOnTop: false }
})

ipcMain.handle('window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.handle('window-toggle-maximize', (event) => {
  const target = BrowserWindow.fromWebContents(event.sender)
  if (!target) return false
  if (target.isMaximized()) target.unmaximize()
  else target.maximize()
  return target.isMaximized()
})

ipcMain.handle('window-toggle-always-on-top', (event) => {
  const target = BrowserWindow.fromWebContents(event.sender)
  if (!target || !detachedPanels.has(target.id)) return false
  const next = !target.isAlwaysOnTop()
  target.setAlwaysOnTop(next)
  sendWindowState(target)
  return next
})

ipcMain.handle('window-restore-detached-panel', (event) => {
  const target = BrowserWindow.fromWebContents(event.sender)
  if (!target) return false
  const detachedPanel = detachedPanels.get(target.id)
  if (!detachedPanel) return false

  const origin = BrowserWindow.getAllWindows().find(
    (candidate) => candidate.webContents.id === detachedPanel.originWebContentsId,
  )
  if (!origin || origin.isDestroyed()) return false
  origin.webContents.send('restore-detached-panel', { windowId: detachedPanel.windowId })
  origin.show()
  origin.focus()
  detachedPanels.delete(target.id)
  target.close()
  return true
})

ipcMain.handle('window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('window-resize-start', (event, edge: WindowResizeEdge) => {
  const target = BrowserWindow.fromWebContents(event.sender)
  const allowedEdges: WindowResizeEdge[] = [
    'top',
    'right',
    'bottom',
    'left',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ]
  if (!target || target.isMaximized() || !allowedEdges.includes(edge)) return

  stopWindowResize(event.sender.id)
  const initialBounds = target.getBounds()
  const initialCursor = screen.getCursorScreenPoint()
  const [minWidth, minHeight] = target.getMinimumSize()

  const interval = setInterval(() => {
    if (target.isDestroyed()) {
      stopWindowResize(event.sender.id)
      return
    }

    const cursor = screen.getCursorScreenPoint()
    const deltaX = cursor.x - initialCursor.x
    const deltaY = cursor.y - initialCursor.y
    const fromLeft = edge.includes('left')
    const fromRight = edge.includes('right')
    const fromTop = edge.includes('top')
    const fromBottom = edge.includes('bottom')
    const width = Math.max(
      minWidth || 640,
      initialBounds.width + (fromRight ? deltaX : fromLeft ? -deltaX : 0),
    )
    const height = Math.max(
      minHeight || 480,
      initialBounds.height + (fromBottom ? deltaY : fromTop ? -deltaY : 0),
    )

    target.setBounds({
      x: fromLeft ? initialBounds.x + initialBounds.width - width : initialBounds.x,
      y: fromTop ? initialBounds.y + initialBounds.height - height : initialBounds.y,
      width,
      height,
    })
  }, 16)

  resizeIntervals.set(event.sender.id, interval)
})

ipcMain.handle('window-resize-stop', (event) => {
  stopWindowResize(event.sender.id)
})

ipcMain.handle('camera-stream-start', (event, url: unknown) => {
  if (!cameraStreamOwners.has(event.sender.id)) {
    cameraStreamOwners.add(event.sender.id)
    event.sender.once('destroyed', () => {
      cameraStreamService.stop(event.sender.id)
      cameraStreamOwners.delete(event.sender.id)
    })
  }
  return cameraStreamService.start(event.sender.id, url, event.sender)
})

ipcMain.handle('camera-stream-stop', (event) => {
  cameraStreamService.stop(event.sender.id)
})

ipcMain.handle('file-playback-start', (event, request) => {
  if (!filePlaybackOwners.has(event.sender.id)) {
    filePlaybackOwners.add(event.sender.id)
    event.sender.once('destroyed', () => {
      void filePlaybackService.stop(event.sender.id, false)
      filePlaybackOwners.delete(event.sender.id)
    })
  }
  return filePlaybackService.start(event.sender.id, request, event.sender)
})

ipcMain.handle('file-playback-stop', (event) => filePlaybackService.stop(event.sender.id))
ipcMain.handle('text-file-stream-open', (event, request) => {
  if (!textFileStreamOwners.has(event.sender.id)) {
    textFileStreamOwners.add(event.sender.id)
    event.sender.once('destroyed', () => {
      void textFileStreamService.closeOwner(event.sender.id)
      textFileStreamOwners.delete(event.sender.id)
    })
  }
  return textFileStreamService.start(event.sender.id, request)
})
ipcMain.handle('text-file-stream-read', (event, requestId) =>
  textFileStreamService.read(event.sender.id, requestId),
)
ipcMain.handle('text-file-stream-close', (event, requestId) =>
  textFileStreamService.close(event.sender.id, requestId),
)

ipcMain.handle('log-recording-start', async (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender)
  const options = {
    title: '录制日志',
    defaultPath: createDefaultLogName(),
    filters: [
      { name: '日志文件', extensions: ['log'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  }
  const result = targetWindow
    ? await dialog.showSaveDialog(targetWindow, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { started: false }

  if (!logRecordingOwners.has(event.sender.id)) {
    logRecordingOwners.add(event.sender.id)
    event.sender.once('destroyed', () => {
      void logRecordingService.stop(event.sender.id, false)
      logRecordingOwners.delete(event.sender.id)
    })
  }
  await logRecordingService.start(event.sender.id, result.filePath, event.sender)
  return { started: true, path: result.filePath }
})

ipcMain.handle('log-recording-stop', (event) => logRecordingService.stop(event.sender.id))
ipcMain.on('log-recording-write', (event, data) => {
  logRecordingService.write(event.sender.id, data)
})

// 版本更新:偏好由渲染端持久化并在初始化时传入,状态经 'update-status-changed' 推送
ipcMain.handle('update-check', () => updateService.checkForUpdates())
ipcMain.handle('update-download', () => updateService.downloadUpdate())
ipcMain.handle('update-quit-and-install', () => updateService.quitAndInstall())
ipcMain.handle('clipboard-read-text', () => clipboard.readText())
ipcMain.handle('clipboard-write-text', (_event, text: string) => clipboard.writeText(text))
ipcMain.on('update-set-prefs', (_event, prefs) => updateService.applyPrefs(prefs))

function createDefaultLogName(): string {
  const now = new Date()
  const digits = (value: number) => String(value).padStart(2, '0')
  return `nav-tools-${now.getFullYear()}${digits(now.getMonth() + 1)}${digits(now.getDate())}-${digits(
    now.getHours(),
  )}${digits(now.getMinutes())}${digits(now.getSeconds())}.log`
}

async function createWindow(options?: { hidden?: boolean }) {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#f3f5f7',
    title: `Nav-Tools ${appVersion}`,
    icon: path.join(VITE_PUBLIC, 'favicon.ico'),
    // 桌面快捷方式冷启动时主窗口隐藏创建:渲染进程照常工作(数据路由/自动重连),
    // 但不出现在桌面与任务栏,用户只看到组件独立窗口
    show: !options?.hidden,
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more: https://docs/develop-advanced/security#security-checklist
      contextIsolation: true,
    },
  })
  configureWebTitleBar(win)
  // 更新状态推送到主窗口
  updateService.attach(win.webContents)

  if (VITE_DEV_SERVER_URL) {
    // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    // win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // win.webContents.on('will-navigate', (event, url) => { }) #344

  // 监听窗口关闭事件，在关闭前保存数据
  let isForceClose = false
  win.on('close', (event) => {
    if (!isForceClose && win) {
      event.preventDefault()
      // 发送保存请求到渲染进程
      win.webContents.send('save-app-mode')
      // 给渲染进程一点时间处理保存操作，然后强制关闭
      setTimeout(() => {
        isForceClose = true
        win?.close()
      }, 100)
    }
  })
}

app.whenReady().then(() => {
  // app ready 后注册瓦片协议 handler 与离线瓦片目录查询 IPC
  offlineTileService.registerHandler()
  ipcMain.handle('get-offline-tiles-dir', () => offlineTileService.getTilesDir())

  // 桌面快捷方式冷启动:主窗口隐藏创建(数据路由等渲染侧职责照常),
  // 桌面上只出现快捷方式指向的组件独立窗口
  const startupComponent = parseOpenComponentArg(process.argv)
  mainWindowHiddenForShortcut = Boolean(startupComponent)
  createWindow(startupComponent ? { hidden: true } : undefined)
  Menu.setApplicationMenu(null)

  if (startupComponent) openComponentStandalone(startupComponent)

  // 注册获取版本号的 IPC 处理器
  ipcMain.handle('get-app-version', () => {
    return appVersion
  })
  // 阻止系统因空闲而挂起 GPU/CPU
  powerSaveBlocker.start('prevent-app-suspension')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
})

// 单实例:数据接入/设备连接由主窗口持有,多实例会互相抢占;
// 双击桌面快捷方式时把 --open-component 转发给已运行实例直接开窗
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const requested = parseOpenComponentArg(argv)
    if (win) {
      // 组件快捷方式只开组件窗口,不把主界面顶到前台;
      // 用户打开应用本体(无组件参数)时才唤出主界面(可能正被快捷方式冷启动隐藏着)
      if (!requested) {
        if (win.isMinimized()) win.restore()
        win.show()
        mainWindowHiddenForShortcut = false
      }
      win.focus()
    }
    if (requested) openComponentStandalone(requested)
  })
}

/** 快捷方式冷启动模式下,最后一个组件窗口关闭即退出,不残留隐藏的后台进程 */
function quitIfShortcutOrphaned(): void {
  if (!mainWindowHiddenForShortcut) return
  if (win?.isVisible()) {
    mainWindowHiddenForShortcut = false
    return
  }
  if (BrowserWindow.getAllWindows().some((window) => window.isVisible())) return
  app.quit()
}

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  cameraCalibrationService.close()
  iapUpgradeService.cancel()
  void terminalService.closeAll()
  cameraStreamService.stopAll()
  void filePlaybackService.stopAll()
  void logRecordingService.stopAll()
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// Open card in new window
/**
 * 创建承载单个组件的独立窗口:卡片分离(open-card-window)与桌面快捷方式启动
 * (--open-component)共用。originWebContentsId 用于数据广播溯源,快捷方式冷启动
 * 时主窗口可能尚未创建,允许缺省。
 */
async function openCardWindow(
  cardData: {
    title?: string
    width?: number
    height?: number
    componentName: string
    windowId?: string
    props?: Record<string, unknown>
  },
  originWebContentsId?: number,
): Promise<number> {
  const cardWindow = new BrowserWindow({
    title: cardData.title || 'Card Content',
    width: cardData.width || 800,
    height: cardData.height || 600,
    frame: false,
    transparent: false,
    backgroundColor: '#ffffff',
    resizable: true,
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  })
  configureWebTitleBar(cardWindow)
  if (typeof cardData.windowId === 'string') {
    detachedPanels.set(cardWindow.id, {
      originWebContentsId: originWebContentsId ?? 0,
      windowId: cardData.windowId,
      componentName:
        typeof cardData.componentName === 'string' ? cardData.componentName : undefined,
    })
  }
  cardWindow.on('close', async (closeEvent) => {
    const detachedPanel = detachedPanels.get(cardWindow.id)
    if (
      detachedPanel?.componentName !== 'Terminal' ||
      detachedPanel.closeConfirmed ||
      terminalService.listSessions().length === 0
    ) {
      return
    }

    closeEvent.preventDefault()
    if (detachedPanel.closeInProgress) return
    detachedPanel.closeInProgress = true
    try {
      const result = await dialog.showMessageBox(cardWindow, {
        type: 'warning',
        buttons: ['关闭并终止 / Close and terminate', '取消 / Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: '关闭终端 / Close Terminal',
        message:
          '关闭终端组件会终止全部 Shell、SSH、SFTP 传输和端口转发。\nClosing Terminal will terminate all shells, SSH sessions, SFTP transfers, and port forwarding.',
      })
      if (result.response !== 0) return
      await terminalService.closeAll()
      detachedPanel.closeConfirmed = true
      cardWindow.close()
    } finally {
      detachedPanel.closeInProgress = false
    }
  })
  cardWindow.once('closed', () => {
    detachedPanels.delete(cardWindow.id)
    quitIfShortcutOrphaned()
  })

  const params = encodeURIComponent(JSON.stringify(cardData))
  const hash = `card/${params}`

  if (VITE_DEV_SERVER_URL) {
    await cardWindow.loadURL(`${VITE_DEV_SERVER_URL}#${hash}`)
  } else {
    await cardWindow.loadFile(indexHtml, { hash })
  }

  return cardWindow.id
}

ipcMain.handle('open-card-window', async (event, serializedData) => {
  let cardData
  try {
    cardData = JSON.parse(serializedData)
  } catch (error) {
    console.error('Error parsing card data:', error)
    return
  }

  return openCardWindow(cardData, event.sender.id)
})

// ---- 桌面快捷方式:--open-component=<面板id> 直达组件独立窗口 ----

/** 快捷方式冷启动/二次启动时打开目标组件窗口 */
function openComponentStandalone(windowId: string): void {
  void openCardWindow(
    {
      componentName: getPanelById(windowId)!.componentName,
      windowId,
      title: 'Nav-Tools',
      width: 980,
      height: 660,
      props: {},
    },
    win?.webContents?.id,
  )
}

ipcMain.handle(
  'create-desktop-shortcut',
  async (event, request: { windowId: string; name: string; iconDataUrl: string }) => {
    if (!request || typeof request.windowId !== 'string') {
      return { ok: false, error: 'Invalid shortcut request' }
    }
    // 开发模式下 process.execPath 指向 node_modules 里的 electron.exe,
    // 建出来的快捷方式指向开发环境,对用户是坏入口——直接拒绝并提示
    if (!app.isPackaged) {
      return { ok: false, error: '开发模式下无法创建桌面快捷方式，请在安装版中使用' }
    }
    const panel = getPanelById(request.windowId)
    if (!panel) return { ok: false, error: '未知的组件' }

    // 保存位置自选:默认桌面 + 建议文件名,用户可改任意目录
    const suggestedName = sanitizeShortcutName(String(request.name || ''), panel.id)
    const defaultPath = path.join(app.getPath('desktop'), `Nav-Tools ${suggestedName}.lnk`)
    const save = await dialog.showSaveDialog(
      BrowserWindow.fromWebContents(event.sender) ?? win ?? undefined!,
      {
        title: `创建快捷方式 - ${suggestedName}`,
        defaultPath,
        filters: [{ name: '快捷方式', extensions: ['lnk'] }],
      },
    )
    if (save.canceled || !save.filePath) return { ok: false, cancelled: true }

    return createDesktopShortcut(
      {
        windowId: request.windowId,
        name: suggestedName,
        iconDataUrl: String(request.iconDataUrl || ''),
      },
      {
        shortcutPath: save.filePath,
        execPath: process.execPath,
        userDataPath: app.getPath('userData'),
      },
    )
  },
)

ipcMain.on('close-card-window', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

// 主窗口收到的实时数据广播给所有独立卡片窗口
ipcMain.on('broadcast-incoming-data', (_event, data: unknown) => {
  if (typeof data !== 'string') return
  for (const windowId of detachedPanels.keys()) {
    const target = BrowserWindow.fromId(windowId)
    if (target && !target.isDestroyed()) {
      target.webContents.send('incoming-data', data)
    }
  }
})

// Open a renderer window for a user-defined application stored in renderer localStorage.
ipcMain.handle('open-application-window', async (_, request) => {
  if (!request || typeof request.id !== 'string' || typeof request.name !== 'string') return null
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(request.id) || request.name.length > 80) {
    console.error('Invalid application window request')
    return null
  }

  const appWindow = new BrowserWindow({
    title: `Nav-Tools - ${request.name}`,
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#f3f5f7',
    icon: path.join(VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  configureWebTitleBar(appWindow)

  // Make all links open with the browser, not with the application
  appWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  const hash = `app/${request.id}`
  if (VITE_DEV_SERVER_URL) {
    await appWindow.loadURL(`${VITE_DEV_SERVER_URL}#${hash}`)
  } else {
    await appWindow.loadFile(indexHtml, { hash })
  }

  return appWindow.id
})

ipcMain.on('console-to-node', eventsMap['console-to-node'])
ipcMain.handle('open-file-dialog', eventsMap['open-file-dialog'])
ipcMain.handle('search-serial-ports', eventsMap['search-serial-ports'])
ipcMain.handle('open-serial-port', eventsMap['open-serial-port'])
ipcMain.handle('close-serial-port', eventsMap['close-serial-port'])
ipcMain.handle('read-file-event', eventsMap['read-file-event'])
ipcMain.on('send-serial-hex-data', eventsMap['send-serial-hex-data'])
ipcMain.on('send-serial-ascii-data', eventsMap['send-serial-ascii-data'])
ipcMain.on('serial-data-format', eventsMap['serial-data-format'])
ipcMain.handle('send-data-chunk', eventsMap['send-data-chunk'])
ipcMain.handle('iap-upgrade-start', eventsMap['iap-upgrade-start'])
ipcMain.handle('iap-upgrade-cancel', eventsMap['iap-upgrade-cancel'])
ipcMain.handle('iap-upgrade-snapshot', eventsMap['iap-upgrade-snapshot'])
ipcMain.handle('open-network-connection', eventsMap['open-network-connection'])
ipcMain.handle('close-network-connection', eventsMap['close-network-connection'])
ipcMain.handle('network-connect-cancel', eventsMap['network-connect-cancel'])
ipcMain.handle('camera-stream-sessions', eventsMap['camera-stream-sessions'])
ipcMain.handle('read-file-utf8', eventsMap['read-file-utf8'])
ipcMain.on('send-network-hex-data', eventsMap['send-network-hex-data'])
ipcMain.on('send-network-ascii-data', eventsMap['send-network-ascii-data'])
ipcMain.handle('camera-command-send', eventsMap['camera-command-send'])
ipcMain.handle('camera-calibration-read-params', eventsMap['camera-calibration-read-params'])
