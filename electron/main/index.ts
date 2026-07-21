import { app, BrowserWindow, shell, ipcMain, Menu, powerSaveBlocker, screen } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { eventsMap } from './events'

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

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

type WindowResizeEdge = 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
const resizeIntervals = new Map<number, ReturnType<typeof setInterval>>()
const detachedPanels = new Map<number, { originWebContentsId: number; windowId: string }>()

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

ipcMain.handle('window-get-state', event => {
  const target = BrowserWindow.fromWebContents(event.sender)
  return target ? getWindowState(target) : { maximized: false, alwaysOnTop: false }
})

ipcMain.handle('window-minimize', event => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.handle('window-toggle-maximize', event => {
  const target = BrowserWindow.fromWebContents(event.sender)
  if (!target) return false
  if (target.isMaximized()) target.unmaximize()
  else target.maximize()
  return target.isMaximized()
})

ipcMain.handle('window-toggle-always-on-top', event => {
  const target = BrowserWindow.fromWebContents(event.sender)
  if (!target || !detachedPanels.has(target.id)) return false
  const next = !target.isAlwaysOnTop()
  target.setAlwaysOnTop(next)
  sendWindowState(target)
  return next
})

ipcMain.handle('window-restore-detached-panel', event => {
  const target = BrowserWindow.fromWebContents(event.sender)
  if (!target) return false
  const detachedPanel = detachedPanels.get(target.id)
  if (!detachedPanel) return false

  const origin = BrowserWindow.getAllWindows().find(
    candidate => candidate.webContents.id === detachedPanel.originWebContentsId,
  )
  if (!origin || origin.isDestroyed()) return false
  origin.webContents.send('restore-detached-panel', { windowId: detachedPanel.windowId })
  origin.show()
  origin.focus()
  detachedPanels.delete(target.id)
  target.close()
  return true
})

ipcMain.handle('window-close', event => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('window-resize-start', (event, edge: WindowResizeEdge) => {
  const target = BrowserWindow.fromWebContents(event.sender)
  const allowedEdges: WindowResizeEdge[] = [
    'top', 'right', 'bottom', 'left',
    'top-left', 'top-right', 'bottom-left', 'bottom-right',
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
    const width = Math.max(minWidth || 640, initialBounds.width + (fromRight ? deltaX : fromLeft ? -deltaX : 0))
    const height = Math.max(minHeight || 480, initialBounds.height + (fromBottom ? deltaY : fromTop ? -deltaY : 0))

    target.setBounds({
      x: fromLeft ? initialBounds.x + initialBounds.width - width : initialBounds.x,
      y: fromTop ? initialBounds.y + initialBounds.height - height : initialBounds.y,
      width,
      height,
    })
  }, 16)

  resizeIntervals.set(event.sender.id, interval)
})

ipcMain.handle('window-resize-stop', event => {
  stopWindowResize(event.sender.id)
})

async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#f3f5f7',
    title: `Nav-Tools ${appVersion}`,
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })
  configureWebTitleBar(win)

  if (VITE_DEV_SERVER_URL) { // #298
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
        isForceClose = true;
        win?.close()
      }, 100)
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  Menu.setApplicationMenu(null)
  
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

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
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
ipcMain.handle('open-card-window', async (event, serializedData) => {
  let cardData
  try {
    cardData = JSON.parse(serializedData)
  } catch (error) {
    console.error('Error parsing card data:', error)
    return
  }
  
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
      backgroundThrottling: false
    },
  })
  configureWebTitleBar(cardWindow)
  if (typeof cardData.windowId === 'string') {
    detachedPanels.set(cardWindow.id, {
      originWebContentsId: event.sender.id,
      windowId: cardData.windowId,
    })
  }
  cardWindow.once('closed', () => detachedPanels.delete(cardWindow.id))

  const params = encodeURIComponent(JSON.stringify(cardData))
  const hash = `card/${params}`

  if (VITE_DEV_SERVER_URL) {
    await cardWindow.loadURL(`${VITE_DEV_SERVER_URL}#${hash}`)
  } else {
    await cardWindow.loadFile(indexHtml, { hash })
  }

  return cardWindow.id
})

ipcMain.on('close-card-window', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
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
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
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
ipcMain.handle('open-network-connection', eventsMap['open-network-connection'])
ipcMain.handle('close-network-connection', eventsMap['close-network-connection'])
ipcMain.on('send-network-hex-data', eventsMap['send-network-hex-data'])
ipcMain.on('send-network-ascii-data', eventsMap['send-network-ascii-data'])
