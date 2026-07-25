/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'vue-virtual-scroller' {
  import { DefineComponent } from 'vue'

  export const RecycleScroller: DefineComponent<any, any, any>
  export const DynamicScroller: DefineComponent<any, any, any>
  export const DynamicScrollerItem: DefineComponent<any, any, any>

  const plugin: { install: any }
  export default plugin
}

interface Window {
  // expose in the `electron/preload/index.ts`
  electronAPI: {
    getAppVersion: () => Promise<string>
    getPathForFile: (file: File) => string
    getWindowState: () => Promise<{ maximized: boolean; alwaysOnTop: boolean }>
    minimizeWindow: () => Promise<void>
    toggleMaximizeWindow: () => Promise<boolean>
    toggleAlwaysOnTop: () => Promise<boolean>
    restoreDetachedPanel: () => Promise<boolean>
    closeWindow: () => Promise<void>
    startWindowResize: (
      edge: import('./core/window/WindowService').WindowResizeEdge,
    ) => Promise<void>
    stopWindowResize: () => Promise<void>
    startCameraStream: (url: string) => Promise<{ ok: boolean; message?: string }>
    stopCameraStream: () => Promise<void>
    sendCameraCommand: (request: {
      host: string
      port: number
      subCommand: string
      content: string
      contentFormat: 'text' | 'hex'
    }) => Promise<{
      response: string
      responseHex: string
      packetHex: string
      subCommandHex: string
      contentHex: string
      contentBytes: number
      dataLength: number
    }>
  }
  ipcRenderer: import('electron').IpcRenderer
}
