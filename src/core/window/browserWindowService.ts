import { createBrowserIpcTransport } from '../platform/IpcTransport'
import { WindowService, type WindowPlatform } from './WindowService'

let instance: WindowService | undefined

export function getBrowserWindowService(): WindowService {
  if (!instance) {
    const fallback: WindowPlatform = {
      getAppVersion: async () => '',
      getWindowState: async () => ({ maximized: false, alwaysOnTop: false }),
      minimizeWindow: async () => undefined,
      toggleMaximizeWindow: async () => false,
      toggleAlwaysOnTop: async () => false,
      restoreDetachedPanel: async () => false,
      closeWindow: async () => undefined,
      startWindowResize: async () => undefined,
      stopWindowResize: async () => undefined,
    }
    instance = new WindowService(window.electronAPI ?? fallback, createBrowserIpcTransport())
  }
  return instance
}
