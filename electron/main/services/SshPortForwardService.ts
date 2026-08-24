import net from 'node:net'
import type { Client, ClientChannel, TcpConnectionDetails } from 'ssh2'
import type {
  PortForwardRule,
  PortForwardStatusEvent,
} from '../../../src/core/terminal/TerminalTypes'

interface ActiveForward {
  stop(): Promise<void>
}

export class SshPortForwardService {
  private readonly active = new Map<string, ActiveForward>()

  constructor(
    private readonly client: Client,
    private readonly sessionId: string,
    private readonly emit: (event: PortForwardStatusEvent) => void,
  ) {}

  public async startEnabled(rules: PortForwardRule[]): Promise<void> {
    await Promise.all(rules.filter((rule) => rule.enabled).map((rule) => this.start(rule)))
  }

  public async start(rule: PortForwardRule): Promise<void> {
    await this.stop(rule.id)
    this.emitStatus(rule.id, 'starting')
    try {
      const forward =
        rule.kind === 'local'
          ? await this.startLocal(rule)
          : rule.kind === 'remote'
            ? await this.startRemote(rule)
            : await this.startDynamic(rule)
      this.active.set(rule.id, forward)
    } catch (error) {
      this.emitStatus(rule.id, 'error', errorMessage(error))
    }
  }

  public async stop(ruleId: string): Promise<void> {
    const current = this.active.get(ruleId)
    if (!current) return
    this.active.delete(ruleId)
    await current.stop()
    this.emitStatus(ruleId, 'stopped')
  }

  public async stopAll(): Promise<void> {
    await Promise.all([...this.active.keys()].map((id) => this.stop(id)))
  }

  private startLocal(rule: PortForwardRule): Promise<ActiveForward> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.client.forwardOut(
          socket.remoteAddress || '127.0.0.1',
          socket.remotePort || 0,
          rule.targetHost,
          rule.targetPort,
          (error, stream) => {
            if (error) {
              socket.destroy(error)
              return
            }
            socket.pipe(stream).pipe(socket)
          },
        )
      })
      server.once('error', reject)
      server.listen(rule.bindPort, safeBindAddress(rule.bindAddress), () => {
        server.off('error', reject)
        const address = server.address()
        const boundPort = typeof address === 'object' && address ? address.port : rule.bindPort
        this.emitStatus(rule.id, 'active', undefined, boundPort)
        resolve({ stop: () => closeServer(server) })
      })
    })
  }

  private startDynamic(rule: PortForwardRule): Promise<ActiveForward> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => void this.handleSocksClient(socket))
      server.once('error', reject)
      server.listen(rule.bindPort, safeBindAddress(rule.bindAddress), () => {
        server.off('error', reject)
        const address = server.address()
        const boundPort = typeof address === 'object' && address ? address.port : rule.bindPort
        this.emitStatus(rule.id, 'active', undefined, boundPort)
        resolve({ stop: () => closeServer(server) })
      })
    })
  }

  private startRemote(rule: PortForwardRule): Promise<ActiveForward> {
    return new Promise((resolve, reject) => {
      const bindAddress = safeBindAddress(rule.bindAddress)
      let actualPort = rule.bindPort
      const connectionHandler = (
        details: TcpConnectionDetails,
        accept: () => ClientChannel,
        rejectConnection: () => void,
      ) => {
        if (details.destPort !== actualPort) return
        const channel = accept()
        const target = net.connect(rule.targetPort, rule.targetHost)
        target.once('error', () => channel.close())
        channel.pipe(target).pipe(channel)
      }

      this.client.on('tcp connection', connectionHandler)
      this.client.forwardIn(bindAddress, rule.bindPort, (error, boundPort) => {
        if (error) {
          this.client.off('tcp connection', connectionHandler)
          reject(error)
          return
        }
        actualPort = boundPort ?? rule.bindPort
        this.emitStatus(rule.id, 'active', undefined, actualPort)
        resolve({
          stop: () =>
            new Promise<void>((done) => {
              this.client.off('tcp connection', connectionHandler)
              this.client.unforwardIn(bindAddress, actualPort, () => done())
            }),
        })
      })
    })
  }

  private async handleSocksClient(socket: net.Socket): Promise<void> {
    const reader = new SocketReader(socket)
    try {
      const greeting = await reader.read(2)
      if (greeting[0] !== 0x05) throw new Error('Only SOCKS5 is supported')
      await reader.read(greeting[1])
      socket.write(Buffer.from([0x05, 0x00]))

      const request = await reader.read(4)
      if (request[0] !== 0x05 || request[1] !== 0x01)
        throw new Error('Only SOCKS CONNECT is supported')
      const host = await readSocksHost(reader, request[3])
      const portBytes = await reader.read(2)
      const port = portBytes.readUInt16BE(0)

      this.client.forwardOut(
        socket.remoteAddress || '127.0.0.1',
        socket.remotePort || 0,
        host,
        port,
        (error, stream) => {
          if (error) {
            reader.detach()
            socket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
            socket.end()
            return
          }
          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
          const remainder = reader.takeRemainder()
          reader.detach()
          if (remainder.length > 0) stream.write(remainder)
          socket.pipe(stream).pipe(socket)
        },
      )
    } catch {
      reader.detach()
      socket.destroy()
    }
  }

  private emitStatus(
    ruleId: string,
    status: PortForwardStatusEvent['status'],
    message?: string,
    boundPort?: number,
  ): void {
    this.emit({ sessionId: this.sessionId, ruleId, status, message, boundPort })
  }
}

class SocketReader {
  private buffer = Buffer.alloc(0)
  private pending:
    { length: number; resolve(value: Buffer): void; reject(error: Error): void } | undefined

  constructor(private readonly socket: net.Socket) {
    socket.on('data', this.onData)
    socket.once('error', this.onError)
    socket.once('close', this.onClose)
  }

  read(length: number): Promise<Buffer> {
    if (this.buffer.length >= length) return Promise.resolve(this.consume(length))
    return new Promise((resolve, reject) => {
      this.pending = { length, resolve, reject }
    })
  }

  takeRemainder(): Buffer {
    const value = this.buffer
    this.buffer = Buffer.alloc(0)
    return value
  }

  detach(): void {
    this.socket.off('data', this.onData)
    this.socket.off('error', this.onError)
    this.socket.off('close', this.onClose)
  }

  private onData = (data: Buffer) => {
    this.buffer = Buffer.concat([this.buffer, data])
    if (this.pending && this.buffer.length >= this.pending.length) {
      const pending = this.pending
      this.pending = undefined
      pending.resolve(this.consume(pending.length))
    }
  }

  private onError = (error: Error) => {
    this.pending?.reject(error)
    this.pending = undefined
  }

  private onClose = () => this.onError(new Error('SOCKS client closed'))

  private consume(length: number): Buffer {
    const result = this.buffer.subarray(0, length)
    this.buffer = this.buffer.subarray(length)
    return result
  }
}

async function readSocksHost(reader: SocketReader, addressType: number): Promise<string> {
  if (addressType === 0x01) {
    const bytes = await reader.read(4)
    return [...bytes].join('.')
  }
  if (addressType === 0x03) {
    const length = (await reader.read(1))[0]
    return (await reader.read(length)).toString('utf8')
  }
  if (addressType === 0x04) {
    const bytes = await reader.read(16)
    const groups: string[] = []
    for (let i = 0; i < bytes.length; i += 2) groups.push(bytes.readUInt16BE(i).toString(16))
    return groups.join(':')
  }
  throw new Error('Unsupported SOCKS address type')
}

function safeBindAddress(value: string): string {
  return value.trim() || '127.0.0.1'
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
