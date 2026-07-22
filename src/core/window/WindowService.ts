import type { IpcTransport } from '../platform/IpcTransport'

export type WindowResizeEdge =
  'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface WindowState {
  maximized: boolean
  alwaysOnTop: boolean
}

export interface WindowPlatform {
  getAppVersion(): Promise<string>
  getWindowState(): Promise<WindowState>
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<boolean>
  toggleAlwaysOnTop(): Promise<boolean>
  restoreDetachedPanel(): Promise<boolean>
  closeWindow(): Promise<void>
  startWindowDrag(cursor: { x: number; y: number }): Promise<void>
  moveWindowDrag(cursor: { x: number; y: number }): Promise<void>
  stopWindowDrag(): Promise<void>
  startWindowResize(edge: WindowResizeEdge): Promise<void>
  stopWindowResize(): Promise<void>
}

export class WindowService {
  public constructor(
    private readonly platform: WindowPlatform,
    private readonly ipc: IpcTransport,
  ) {}

  public getAppVersion(): Promise<string> {
    return this.platform.getAppVersion()
  }

  public getState(): Promise<WindowState> {
    return this.platform.getWindowState()
  }

  public minimize(): Promise<void> {
    return this.platform.minimizeWindow()
  }

  public toggleMaximize(): Promise<boolean> {
    return this.platform.toggleMaximizeWindow()
  }

  public close(): Promise<void> {
    return this.platform.closeWindow()
  }

  public startDrag(cursor: { x: number; y: number }): Promise<void> {
    return this.platform.startWindowDrag(cursor)
  }

  public moveDrag(cursor: { x: number; y: number }): Promise<void> {
    return this.platform.moveWindowDrag(cursor)
  }

  public stopDrag(): Promise<void> {
    return this.platform.stopWindowDrag()
  }

  public toggleAlwaysOnTop(): Promise<boolean> {
    return this.platform.toggleAlwaysOnTop()
  }

  public restoreDetachedPanel(): Promise<boolean> {
    return this.platform.restoreDetachedPanel()
  }

  public startResize(edge: WindowResizeEdge): Promise<void> {
    return this.platform.startWindowResize(edge)
  }

  public stopResize(): Promise<void> {
    return this.platform.stopWindowResize()
  }

  public onStateChanged(listener: (state: WindowState) => void): () => void {
    return this.ipc.on('window-state-changed', (_event, state) => {
      if (isWindowState(state)) listener(state)
    })
  }
}

function isWindowState(value: unknown): value is WindowState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WindowState).maximized === 'boolean' &&
    typeof (value as WindowState).alwaysOnTop === 'boolean'
  )
}
