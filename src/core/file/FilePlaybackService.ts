import type { IpcTransport } from '../platform/IpcTransport'

export interface FilePlaybackOptions {
  path: string
  replaySpeed: number
  startOffset: number
  filePositionBytes: 4 | 8
}

export interface FilePlaybackStatus {
  state: 'playing' | 'completed' | 'stopped' | 'error'
  path: string
  message?: string
}

export class FilePlaybackService {
  public constructor(private readonly ipc: IpcTransport) {}

  public start(options: FilePlaybackOptions): Promise<{ ok: true }> {
    return this.ipc.invoke<{ ok: true }>('file-playback-start', options)
  }

  public stop(): Promise<void> {
    return this.ipc.invoke<void>('file-playback-stop')
  }

  public onData(listener: (data: string) => void): () => void {
    return this.ipc.on('file-playback-data', (_event, data) => listener(String(data)))
  }

  public onStatus(listener: (status: FilePlaybackStatus) => void): () => void {
    return this.ipc.on('file-playback-status', (_event, value) => {
      if (isFilePlaybackStatus(value)) listener(value)
    })
  }
}

function isFilePlaybackStatus(value: unknown): value is FilePlaybackStatus {
  if (!value || typeof value !== 'object') return false
  const status = value as FilePlaybackStatus
  return (
    (status.state === 'playing' ||
      status.state === 'completed' ||
      status.state === 'stopped' ||
      status.state === 'error') &&
    typeof status.path === 'string' &&
    (status.message === undefined || typeof status.message === 'string')
  )
}
