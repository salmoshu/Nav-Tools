export type IpcListener = (event: unknown, ...args: unknown[]) => void

export interface IpcTransport {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, listener: IpcListener): () => void
}

export function createBrowserIpcTransport(): IpcTransport {
  return {
    invoke<T>(channel: string, ...args: unknown[]) {
      if (!window.ipcRenderer) return Promise.reject(new Error(`IPC is unavailable: ${channel}`))
      return window.ipcRenderer.invoke(channel, ...args) as Promise<T>
    },
    send(channel: string, ...args: unknown[]) {
      window.ipcRenderer?.send(channel, ...args)
    },
    on(channel: string, listener: IpcListener) {
      if (!window.ipcRenderer) return () => undefined
      const ipcListener = listener as (...args: unknown[]) => void
      window.ipcRenderer.on(channel, ipcListener)
      return () => window.ipcRenderer.off(channel, ipcListener)
    },
  }
}
