import type { IpcTransport } from '../platform/IpcTransport'

interface TextFileStreamChunk {
  data: string
  processedBytes: number
  totalBytes: number
  done: boolean
}

export interface TextFileStreamCallbacks {
  onChunk(data: string): void
  onProgress(progress: number): void
}

export class TextFileStreamService {
  private requestSequence = 0

  public constructor(private readonly ipc: IpcTransport) {}

  public async read(path: string, callbacks: TextFileStreamCallbacks): Promise<void> {
    const requestId = `${Date.now()}-${++this.requestSequence}`
    await this.ipc.invoke('text-file-stream-open', { path, requestId })

    try {
      while (true) {
        const chunk = await this.ipc.invoke<TextFileStreamChunk>(
          'text-file-stream-read',
          requestId,
        )
        if (chunk.data) callbacks.onChunk(chunk.data)
        callbacks.onProgress(
          chunk.totalBytes <= 0 ? 100 : (chunk.processedBytes / chunk.totalBytes) * 100,
        )
        if (chunk.done) break
      }
    } finally {
      await this.ipc.invoke('text-file-stream-close', requestId).catch(() => undefined)
    }
  }
}
