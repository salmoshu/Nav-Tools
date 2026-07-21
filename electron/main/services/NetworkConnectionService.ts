import dgram, { type RemoteInfo, type Socket as UdpSocket } from 'node:dgram'
import net, { type Socket as TcpSocket } from 'node:net'

export type NetworkProtocol = 'tcp' | 'udp'
export type NetworkDataFormat = 'ascii' | 'hex'

export interface NetworkConnectionOptions {
  protocol: NetworkProtocol
  host: string
  port: number
}

export interface NetworkCallbacks {
  onData(data: string): void
  onDisconnected(options: NetworkConnectionOptions, reason?: string): void
}

export class NetworkConnectionService {
  private tcpSocket: TcpSocket | undefined
  private udpSocket: UdpSocket | undefined
  private currentOptions: NetworkConnectionOptions | undefined
  private lastUdpRemote: RemoteInfo | undefined
  private dataFormat: NetworkDataFormat = 'ascii'
  private intentionalClose = false

  public async open(options: NetworkConnectionOptions, callbacks: NetworkCallbacks): Promise<void> {
    await this.close()
    this.currentOptions = { ...options, host: options.host.trim() }
    this.intentionalClose = false

    if (options.protocol === 'tcp') await this.openTcp(this.currentOptions, callbacks)
    else await this.openUdp(this.currentOptions, callbacks)
  }

  public async close(): Promise<void> {
    this.intentionalClose = true
    const tcpSocket = this.tcpSocket
    const udpSocket = this.udpSocket
    this.tcpSocket = undefined
    this.udpSocket = undefined
    this.currentOptions = undefined
    this.lastUdpRemote = undefined

    if (tcpSocket && !tcpSocket.destroyed) {
      await new Promise<void>((resolve) => {
        tcpSocket.once('close', resolve)
        tcpSocket.destroy()
      })
    }
    if (udpSocket) {
      await new Promise<void>((resolve) => {
        try {
          udpSocket.close(resolve)
        } catch {
          resolve()
        }
      })
    }
  }

  public setDataFormat(format: string): void {
    this.dataFormat = format === 'hex' ? 'hex' : 'ascii'
  }

  public async send(data: string, format: NetworkDataFormat): Promise<void> {
    const buffer = Buffer.from(data, format === 'hex' ? 'hex' : 'utf8')
    if (this.tcpSocket && !this.tcpSocket.destroyed) {
      await new Promise<void>((resolve, reject) => {
        this.tcpSocket?.write(buffer, (error) => (error ? reject(error) : resolve()))
      })
      return
    }

    if (this.udpSocket && this.lastUdpRemote) {
      const remote = this.lastUdpRemote
      await new Promise<void>((resolve, reject) => {
        this.udpSocket?.send(buffer, remote.port, remote.address, (error) =>
          error ? reject(error) : resolve(),
        )
      })
      return
    }

    throw new Error('网络连接不可用；UDP 需要先接收到一个远端数据包')
  }

  private openTcp(options: NetworkConnectionOptions, callbacks: NetworkCallbacks): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false
      let opened = false
      const socket = net.createConnection({ host: options.host, port: options.port })
      this.tcpSocket = socket

      socket.setNoDelay(true)
      socket.once('connect', () => {
        settled = true
        opened = true
        resolve()
      })
      socket.on('data', (chunk) => callbacks.onData(this.formatData(chunk)))
      socket.on('error', (error) => {
        if (!settled) {
          settled = true
          this.tcpSocket = undefined
          this.currentOptions = undefined
          reject(error)
        }
      })
      socket.once('close', (hadError) => {
        const intentional = this.intentionalClose
        this.intentionalClose = false
        if (this.tcpSocket === socket) this.tcpSocket = undefined
        if (this.currentOptions === options) this.currentOptions = undefined
        if (!intentional && opened) {
          callbacks.onDisconnected(options, hadError ? 'TCP 连接异常关闭' : 'TCP 连接已关闭')
        }
      })
    })
  }

  private openUdp(options: NetworkConnectionOptions, callbacks: NetworkCallbacks): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false
      let opened = false
      const socket = dgram.createSocket('udp4')
      this.udpSocket = socket

      socket.on('message', (message, remote) => {
        this.lastUdpRemote = remote
        callbacks.onData(this.formatData(message))
      })
      socket.once('listening', () => {
        settled = true
        opened = true
        resolve()
      })
      socket.on('error', (error) => {
        if (!settled) {
          settled = true
          this.udpSocket = undefined
          this.currentOptions = undefined
          socket.close()
          reject(error)
          return
        }
        socket.close()
      })
      socket.once('close', () => {
        const intentional = this.intentionalClose
        this.intentionalClose = false
        if (this.udpSocket === socket) this.udpSocket = undefined
        if (this.currentOptions === options) this.currentOptions = undefined
        if (!intentional && opened) callbacks.onDisconnected(options, 'UDP 监听已关闭')
      })
      socket.bind(options.port, options.host)
    })
  }

  private formatData(data: Uint8Array): string {
    return this.dataFormat === 'hex'
      ? Array.from(data, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('')
      : Buffer.from(data).toString('utf8')
  }
}
