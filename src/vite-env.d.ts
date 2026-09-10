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
    getOfflineTilesDir: () => Promise<string>
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
      subCommand: string
      content: string
      contentFormat: 'text' | 'hex'
    }) => Promise<{
      packetHex: string
      subCommandHex: string
      contentHex: string
      contentBytes: number
      dataLength: number
    }>
    cameraCalibrationSnapshot: () => Promise<import('./core/camera/CameraCalibrationTypes').CameraCalibrationSnapshot>
    cameraCalibrationAccess: () => Promise<{
      host?: string
      port?: number
      username?: string
      hasPassword: boolean
    }>
    cameraCalibrationReadParams: () => Promise<import('./core/camera/CameraParamReadback').CameraParamSnapshot>
    cameraCalibrationObserve: (request: {
      host: string
      port: number
      username: string
      password?: string
    }) => Promise<import('./core/camera/CameraCalibrationTypes').CameraCalibrationSnapshot>
    cameraCalibrationStart: (
      config: import('./core/camera/CameraCalibrationTypes').CameraCalibrationConfig,
    ) => Promise<import('./core/camera/CameraCalibrationTypes').CameraCalibrationSnapshot>
    cameraCalibrationStop: () => Promise<import('./core/camera/CameraCalibrationTypes').CameraCalibrationSnapshot>
    cameraCalibrationRestore: () => Promise<import('./core/camera/CameraCalibrationTypes').CameraCalibrationSnapshot>
    cameraCalibrationClose: () => Promise<import('./core/camera/CameraCalibrationTypes').CameraCalibrationSnapshot>
    cameraScriptRun: (request: {
      host: string
      port: number
      username: string
      password?: string
      localPath: string
      timeoutS: number
    }) => Promise<{ ok: boolean }>
    cameraScriptStop: () => Promise<void>
    checkForUpdates: () => Promise<void>
    downloadUpdate: () => Promise<void>
    quitAndInstall: () => Promise<void>
    setUpdaterPrefs: (prefs: import('./core/update/UpdaterService').UpdaterPrefs) => void
  }
  ipcRenderer: import('electron').IpcRenderer
}
