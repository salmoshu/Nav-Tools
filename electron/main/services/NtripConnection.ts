import net from 'node:net'
import type { DataInjectionSettings } from '../../../src/core/data/DataInjection'

/** Adapted from Nav-Bridge's NtripClientAdapter: ICY v1, HTTP and chunked responses. */
export class NtripResponseParser {
  private pending = Buffer.alloc(0)
  private response: 'headers' | 'icy-prefix' | 'body' = 'headers'
  private chunked = false
  private chunkRemaining?: number
  private chunkTerminator = false
  private ended = false

  public constructor(
    private readonly onConnected: () => void,
    private readonly onData: (data: Buffer) => void,
    private readonly onEnd: () => void,
    private readonly responseType: 'corrections' | 'source-table' = 'corrections',
  ) {}

  public push(data: Buffer): void {
    if (this.ended) return
    this.pending = Buffer.concat([this.pending, data])
    if (this.response === 'headers') {
      const lineEnd = this.pending.indexOf('\r\n')
      if (lineEnd < 0) {
        this.checkHeaderSize()
        return
      }
      const status = this.pending.toString('ascii', 0, lineEnd)
      if (status === 'ICY 200 OK') {
        this.pending = this.pending.subarray(lineEnd + 2)
        this.response = 'icy-prefix'
        this.onConnected()
      } else {
        const sourceTable = this.responseType === 'source-table'
        if (
          !/^HTTP\/1\.[01] 200(?: |$)/.test(status) &&
          !(sourceTable && /^SOURCETABLE 200(?: |$)/.test(status))
        )
          throw new Error(`NTRIP connection rejected: ${status.slice(0, 160)}`)
        const headerEnd = this.pending.indexOf('\r\n\r\n')
        if (headerEnd < 0) {
          this.checkHeaderSize()
          return
        }
        if (headerEnd > 16384) throw new Error('NTRIP response headers are too large')
        const headers = this.pending.toString('ascii', 0, headerEnd)
        if (
          /^content-type:\s*text\/html/im.test(headers) ||
          (!sourceTable && /^content-type:\s*gnss\/sourcetable/im.test(headers))
        )
          throw new Error('NTRIP caster did not return a correction stream')
        this.chunked = /^transfer-encoding:.*\bchunked\b/im.test(headers)
        this.pending = this.pending.subarray(headerEnd + 4)
        this.response = 'body'
        this.onConnected()
      }
    }
    if (this.response === 'icy-prefix') {
      if (this.pending.length === 0 || (this.pending.length === 1 && this.pending[0] === 13)) return
      if (this.pending[0] === 13 && this.pending[1] === 10) this.pending = this.pending.subarray(2)
      this.response = 'body'
    }
    if (this.chunked) this.decodeChunks()
    else if (this.pending.length > 0) {
      this.onData(this.pending)
      this.pending = Buffer.alloc(0)
    }
  }

  private checkHeaderSize(): void {
    if (this.pending.length > 16384) throw new Error('NTRIP response headers are too large')
  }

  private decodeChunks(): void {
    while (!this.ended) {
      if (this.chunkTerminator) {
        if (this.pending.length < 2) return
        if (this.pending[0] !== 13 || this.pending[1] !== 10)
          throw new Error('Invalid NTRIP chunk terminator')
        this.pending = this.pending.subarray(2)
        this.chunkTerminator = false
      }
      if (this.chunkRemaining === undefined) {
        const lineEnd = this.pending.indexOf('\r\n')
        if (lineEnd < 0) {
          if (this.pending.length > 1024) throw new Error('Invalid NTRIP chunk header')
          return
        }
        const size = this.pending.toString('ascii', 0, lineEnd).split(';', 1)[0]
        if (!/^[0-9a-f]+$/i.test(size) || !Number.isSafeInteger(Number.parseInt(size, 16)))
          throw new Error('Invalid NTRIP chunk size')
        this.chunkRemaining = Number.parseInt(size, 16)
        this.pending = this.pending.subarray(lineEnd + 2)
        if (this.chunkRemaining === 0) {
          this.ended = true
          this.pending = Buffer.alloc(0)
          this.onEnd()
          return
        }
      }
      if (this.pending.length === 0) return
      const length = Math.min(this.chunkRemaining, this.pending.length)
      this.onData(this.pending.subarray(0, length))
      this.pending = this.pending.subarray(length)
      this.chunkRemaining -= length
      if (this.chunkRemaining === 0) {
        this.chunkRemaining = undefined
        this.chunkTerminator = true
      }
    }
  }
}

export class NtripConnection {
  private socket?: net.Socket
  private cancel?: (error: Error) => void

  public constructor(private readonly options: DataInjectionSettings['network']) {}

  public open(
    onData: (data: Uint8Array) => void,
    onDisconnected: (reason: string) => void,
  ): Promise<void> {
    const options = this.options
    const socket = net.createConnection({ host: options.host.trim(), port: options.port })
    this.socket = socket
    socket.setNoDelay(true)
    socket.setKeepAlive(true, 5000)
    return new Promise((resolve, reject) => {
      let settled = false
      let failure = 'NTRIP connection closed'
      const timer = setTimeout(() => fail(new Error('NTRIP handshake timed out')), 10000)
      const fail = (error: Error) => {
        failure = error.message
        clearTimeout(timer)
        if (!settled) {
          settled = true
          reject(error)
        }
        socket.destroy()
      }
      this.cancel = fail
      const parser = new NtripResponseParser(
        () => {
          settled = true
          clearTimeout(timer)
          resolve()
        },
        onData,
        () => socket.destroy(),
      )
      socket.once('connect', () => {
        const host = options.host.includes(':') ? `[${options.host.trim()}]` : options.host.trim()
        const mountpoint = options.mountpoint.trim().replace(/^\/+/, '')
        const headers = [
          `GET /${encodeURI(mountpoint).replace(/[?#]/g, encodeURIComponent)} HTTP/1.0`,
          `Host: ${host}:${options.port}`,
          'User-Agent: NTRIP Nav-Tools',
          'Accept: */*',
          'Accept-Encoding: identity',
          'Connection: close',
        ]
        if (options.username || options.password)
          headers.push(
            `Authorization: Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`,
          )
        socket.write(`${headers.join('\r\n')}\r\n\r\n`)
      })
      socket.on('data', (data) => {
        try {
          parser.push(data)
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)))
        }
      })
      socket.on('error', fail)
      socket.setTimeout(30000, () => fail(new Error('NTRIP stream inactive timeout')))
      socket.once('close', () => {
        clearTimeout(timer)
        if (!settled) {
          settled = true
          reject(new Error(failure))
        }
        if (this.socket === socket) {
          this.socket = undefined
          this.cancel = undefined
          onDisconnected(failure)
        }
      })
    })
  }

  public async close(): Promise<void> {
    const cancel = this.cancel
    const socket = this.socket
    this.socket = undefined
    this.cancel = undefined
    cancel?.(new Error('Injection connection cancelled'))
    socket?.destroy()
  }

  public async send(data: Uint8Array): Promise<void> {
    const socket = this.socket
    if (!socket || socket.destroyed || socket.readyState !== 'open')
      throw new Error('NTRIP is disconnected')
    await new Promise<void>((resolve, reject) => {
      socket.write(Buffer.from(data), (error) => (error ? reject(error) : resolve()))
    })
  }
}
