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

// 对端断电/拔线时 TCP 不会收到 FIN/RST（半开连接），只能靠 keepalive 探针发现。
// initialDelay 为空闲毫秒数；Windows 上随后的探针间隔/次数取系统默认（1s×10），
// 即拔线后约 15s 内触发 close → onDisconnected，工具栏开关随之复位。
const TCP_KEEPALIVE_IDLE_MS = 5000

export class NetworkConnectionService {
  private tcpSocket: TcpSocket | undefined
  private udpSocket: UdpSocket | undefined
  private currentOptions: NetworkConnectionOptions | undefined
  private lastUdpRemote: RemoteInfo | undefined
  private dataFormat: NetworkDataFormat = 'ascii'
  private intentionalClose = false
  private readonly rawDataListeners = new Set<(data: Uint8Array) => void>()

  /** 原始字节流订阅:不受控制台 hex/ascii 显示格式切换影响 */
  public onRawData(listener: (data: Uint8Array) => void): () => void {
    this.rawDataListeners.add(listener)
    return () => this.rawDataListeners.delete(listener)
  }

  private connecting = false
  private cancelOpen: ((error: Error) => void) | undefined

  public async open(options: NetworkConnectionOptions, callbacks: NetworkCallbacks): Promise<void> {
    await this.close()
    this.currentOptions = { ...options, host: options.host.trim() }
    this.intentionalClose = false
    this.connecting = true
    const resolvedOptions = this.currentOptions
    try {
      await new Promise<void>((resolve, reject) => {
        this.cancelOpen = (error: Error) => reject(error)
        if (resolvedOptions.protocol === 'tcp') void this.openTcp(resolvedOptions, callbacks, resolve, reject)
        else void this.openUdp(resolvedOptions, callbacks, resolve, reject)
      })
    } finally {
      this.connecting = false
      this.cancelOpen = undefined
    }
  }

  /** 终止正在进行的连接尝试: 摧毁底层 socket 并让 open() 以取消错误结束 */
  public cancelPending(): void {
    if (!this.connecting) return
    this.intentionalClose = true
    const cancel = this.cancelOpen
    this.tcpSocket?.destroy()
    this.udpSocket?.close(() => undefined)
    cancel?.(new Error('已取消连接'))
    this.connecting = false
    this.tcpSocket = undefined
    this.udpSocket = undefined
    this.currentOptions = undefined
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

  public getTcpTarget(): { host: string; port: number } | undefined {
    if (this.tcpSocket?.readyState !== 'open' || this.currentOptions?.protocol !== 'tcp') return
    return { host: this.currentOptions.host, port: this.currentOptions.port }
  }

  public async sendTcp(data: Uint8Array): Promise<void> {
    const socket = this.tcpSocket
    if (!socket || socket.destroyed)
      throw new Error('工具栏 TCP 连接不可用，请先在数据接入中建立连接')

    await new Promise<void>((resolve, reject) => {
      socket.write(Buffer.from(data), (error) => (error ? reject(error) : resolve()))
    })
  }

  public async send(data: string, format: NetworkDataFormat): Promise<void> {
    const buffer = Buffer.from(data, format === 'hex' ? 'hex' : 'utf8')
    if (this.tcpSocket && !this.tcpSocket.destroyed) {
      await this.sendTcp(buffer)
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

  private openTcp(
    options: NetworkConnectionOptions,
    callbacks: NetworkCallbacks,
    resolve: () => void,
    reject: (error: Error) => void,
  ): void {
    let settled = false
    let opened = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    const socket = net.createConnection({ host: options.host, port: options.port })
    this.tcpSocket = socket

    socket.setNoDelay(true)
    socket.setKeepAlive(true, TCP_KEEPALIVE_IDLE_MS)
    socket.once('connect', () => {
      opened = true
      settle(resolve)
    })
    socket.on('data', (chunk) => {
      for (const listener of this.rawDataListeners) listener(chunk)
      callbacks.onData(this.formatData(chunk))
    })
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
      if (!settled) {
        settle(() => reject(new Error('连接已取消')))
        return
      }
      if (!intentional && opened) {
        callbacks.onDisconnected(options, hadError ? 'TCP 连接异常关闭' : 'TCP 连接已关闭')
      }
    })
  }

  private openUdp(
    options: NetworkConnectionOptions,
    callbacks: NetworkCallbacks,
    resolve: () => void,
    reject: (error: Error) => void,
  ): void {
    let settled = false
    let opened = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    const socket = dgram.createSocket('udp4')
    this.udpSocket = socket

    socket.on('message', (message, remote) => {
      this.lastUdpRemote = remote
      for (const listener of this.rawDataListeners) listener(message)
      callbacks.onData(this.formatData(message))
    })
    socket.once('listening', () => {
      opened = true
      settle(resolve)
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
      if (!settled) {
        settle(() => reject(new Error('连接已取消')))
        return
      }
      if (!intentional && opened) callbacks.onDisconnected(options, 'UDP 监听已关闭')
    })
    socket.bind(options.port, options.host)
  }

  private formatData(data: Uint8Array): string {
    return this.dataFormat === 'hex'
      ? Array.from(data, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('')
      : Buffer.from(data).toString('utf8')
  }
}
