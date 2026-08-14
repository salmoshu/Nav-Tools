import { ipcRenderer, contextBridge, webUtils } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getOfflineTilesDir: () => ipcRenderer.invoke('get-offline-tiles-dir'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getWindowState: () => ipcRenderer.invoke('window-get-state'),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window-toggle-always-on-top'),
  restoreDetachedPanel: () => ipcRenderer.invoke('window-restore-detached-panel'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  startWindowResize: (edge: string) => ipcRenderer.invoke('window-resize-start', edge),
  stopWindowResize: () => ipcRenderer.invoke('window-resize-stop'),
  startCameraStream: (url: string) => ipcRenderer.invoke('camera-stream-start', url),
  stopCameraStream: () => ipcRenderer.invoke('camera-stream-stop'),
  sendCameraCommand: (request: {
    host: string
    port: number
    subCommand: string
    content: string
    contentFormat: 'text' | 'hex'
  }) => ipcRenderer.invoke('camera-command-send', request),
  checkForUpdates: () => ipcRenderer.invoke('update-check'),
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  quitAndInstall: () => ipcRenderer.invoke('update-quit-and-install'),
  setUpdaterPrefs: (prefs: {
    autoCheck: boolean
    autoDownload: boolean
    ignoredVersion?: string
  }) => ipcRenderer.send('update-set-prefs', prefs),
})
const listenerMap = new Map<string, Map<Function, (...args: unknown[]) => void>>()

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    const wrapped = (event: unknown, ...listenerArgs: unknown[]) =>
      listener(event as never, ...listenerArgs)
    const channelListeners = listenerMap.get(channel) ?? new Map()
    channelListeners.set(listener, wrapped)
    listenerMap.set(channel, channelListeners)
    ipcRenderer.on(channel, wrapped)
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, listener] = args
    const channelListeners = listenerMap.get(channel)
    const wrapped = channelListeners?.get(listener)
    if (wrapped) {
      ipcRenderer.off(channel, wrapped)
      channelListeners?.delete(listener)
    }
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

// --------- Preload scripts loading ---------
function domReady(condition: string[] = ['complete', 'interactive']) {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find((e) => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find((e) => e === child)) {
      return parent.removeChild(child)
    }
  },
}

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
