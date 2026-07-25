import type { IpcTransport } from '../platform/IpcTransport'

export interface LogRecordingResult {
  started: boolean
  path?: string
}

export interface LogRecordingStatus {
  state: 'recording' | 'stopped' | 'error'
  path: string
  message?: string
}

export class LogRecordingService {
  public constructor(private readonly ipc: IpcTransport) {}

  public start(): Promise<LogRecordingResult> {
    return this.ipc.invoke<LogRecordingResult>('log-recording-start')
  }

  public stop(): Promise<void> {
    return this.ipc.invoke<void>('log-recording-stop')
  }

  public write(data: string): void {
    this.ipc.send('log-recording-write', data)
  }

  public onStatus(listener: (status: LogRecordingStatus) => void): () => void {
    return this.ipc.on('log-recording-status', (_event, value) => {
      if (isLogRecordingStatus(value)) listener(value)
    })
  }
}

function isLogRecordingStatus(value: unknown): value is LogRecordingStatus {
  if (!value || typeof value !== 'object') return false
  const status = value as LogRecordingStatus
  return (
    (status.state === 'recording' || status.state === 'stopped' || status.state === 'error') &&
    typeof status.path === 'string' &&
    (status.message === undefined || typeof status.message === 'string')
  )
}
