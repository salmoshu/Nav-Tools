import { app, BrowserWindow, shell, ipcMain, Menu, powerSaveBlocker } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { appConfig } from '../../src/settings/config'
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

async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
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

function createMenu() {
  // 基础菜单模板
  const template = [
    {
      label: 'SETTING',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
  ]

  // 根据AppMap第一层内容自动生成菜单项
  const appMenuItems = Object.entries(appConfig).map(([key, config]) => ({
    label: key.toUpperCase(),
    // click: () => {
    //   win?.webContents.send(`open-${key}-view`)
    // },
    submenu: Object.entries((config as any)).map(([moduleKey, moduleConfig]) => ({
      label: (moduleConfig as any).title,
      click: () => {
        win?.webContents.send(`open-${moduleKey}-view`)
      }
    }))
  }))

  // 合并基础模板和动态生成的App菜单
  const finalTemplate = [...appMenuItems, ...template,]

  const menu = Menu.buildFromTemplate(finalTemplate as any)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  createWindow()
  createMenu()
  
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

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

// Open card in new window
ipcMain.handle('open-card-window', async (_, serializedData) => {
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
    transparent: true,
    resizable: true,
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    },
  })

  ipcMain.on('close-card-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  const params = encodeURIComponent(JSON.stringify(cardData))
  const hash = `card/${params}`

  if (VITE_DEV_SERVER_URL) {
    await cardWindow.loadURL(`${VITE_DEV_SERVER_URL}#${hash}`)
  } else {
    await cardWindow.loadFile(indexHtml, { hash })
  }

  return cardWindow.id
})

ipcMain.on('update-follow-config', (event, newConfig) => {
  const sendingWin = BrowserWindow.fromWebContents(event.sender)
  BrowserWindow.getAllWindows().forEach(win => {
    if (win !== sendingWin) {
      win.webContents.send('follow-config-updated', newConfig)
    }
  })
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
