import { open, type FileHandle } from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'

const READ_CHUNK_SIZE = 1024 * 1024

interface TextFileSession {
  ownerId: number
  requestId: string
  handle: FileHandle
  decoder: StringDecoder
  position: number
  totalBytes: number
}

export interface TextFileStreamRequest {
  path: string
  requestId: string
}

export interface TextFileStreamChunk {
  data: string
  processedBytes: number
  totalBytes: number
  done: boolean
}

export class TextFileStreamService {
  private readonly sessions = new Map<string, TextFileSession>()

  public async start(ownerId: number, value: unknown): Promise<{ totalBytes: number }> {
    const request = normalizeRequest(value)
    const key = sessionKey(ownerId, request.requestId)
    await this.closeByKey(key)
    const handle = await open(request.path, 'r')

    try {
      const stat = await handle.stat()
      this.sessions.set(key, {
        ownerId,
        requestId: request.requestId,
        handle,
        decoder: new StringDecoder('utf8'),
        position: 0,
        totalBytes: stat.size,
      })
      return { totalBytes: stat.size }
    } catch (error) {
      await handle.close().catch(() => undefined)
      throw error
    }
  }

  public async read(ownerId: number, requestIdValue: unknown): Promise<TextFileStreamChunk> {
    const requestId = String(requestIdValue ?? '').trim()
    const key = sessionKey(ownerId, requestId)
    const session = this.sessions.get(key)
    if (!session) throw new Error('text file stream is not open')

    const remaining = session.totalBytes - session.position
    if (remaining <= 0) return this.finish(key, session)
    const buffer = Buffer.allocUnsafe(Math.min(READ_CHUNK_SIZE, remaining))
    const result = await session.handle.read(buffer, 0, buffer.length, session.position)
    if (result.bytesRead <= 0) return this.finish(key, session)

    session.position += result.bytesRead
    const reachedEnd = session.position >= session.totalBytes
    const data = session.decoder.write(buffer.subarray(0, result.bytesRead))
    if (reachedEnd) {
      const tail = session.decoder.end()
      await this.closeByKey(key)
      return {
        data: data + tail,
        processedBytes: session.position,
        totalBytes: session.totalBytes,
        done: true,
      }
    }
    return {
      data,
      processedBytes: session.position,
      totalBytes: session.totalBytes,
      done: false,
    }
  }

  public close(ownerId: number, requestId: unknown): Promise<void> {
    return this.closeByKey(sessionKey(ownerId, String(requestId ?? '').trim()))
  }

  public async closeOwner(ownerId: number): Promise<void> {
    await Promise.all(
      Array.from(this.sessions.entries())
        .filter(([, session]) => session.ownerId === ownerId)
        .map(([key]) => this.closeByKey(key)),
    )
  }

  private async finish(key: string, session: TextFileSession): Promise<TextFileStreamChunk> {
    const tail = session.decoder.end()
    await this.closeByKey(key)
    return {
      data: tail,
      processedBytes: session.position,
      totalBytes: session.totalBytes,
      done: true,
    }
  }

  private async closeByKey(key: string): Promise<void> {
    const session = this.sessions.get(key)
    if (!session) return
    this.sessions.delete(key)
    await session.handle.close().catch(() => undefined)
  }
}

function normalizeRequest(value: unknown): TextFileStreamRequest {
  if (!value || typeof value !== 'object') throw new TypeError('invalid text file request')
  const request = value as Partial<TextFileStreamRequest>
  const path = String(request.path ?? '').trim()
  const requestId = String(request.requestId ?? '').trim()
  if (!path) throw new TypeError('file path is required')
  if (!requestId) throw new TypeError('request id is required')
  return { path, requestId }
}

function sessionKey(ownerId: number, requestId: string): string {
  return `${ownerId}:${requestId}`
}
