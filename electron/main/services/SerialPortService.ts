import { SerialPort } from 'serialport'

export type SerialDataFormat = 'ascii' | 'hex'

export interface SerialPortOptions {
  path: string
  baudRate: number
  dataBits: 5 | 6 | 7 | 8
  stopBits: 1 | 1.5 | 2
  parity: 'none' | 'even' | 'odd'
}

export interface SerialPortCallbacks {
  onData(data: string): void
  onDisconnected(path: string): void
}

export class SerialPortService {
  private currentPort: SerialPort | undefined
  private dataFormat: SerialDataFormat = 'ascii'
  private intentionalClose = false

  public async listPorts(): Promise<string[]> {
    const ports = await SerialPort.list()
    return ports.flatMap((port) => (port.friendlyName ? [port.friendlyName] : [port.path]))
  }

  public async open(options: SerialPortOptions, callbacks: SerialPortCallbacks): Promise<string> {
    if (this.currentPort?.path === options.path && this.currentPort.isOpen) {
      throw new Error('当前串口已打开')
    }

    if (this.currentPort?.isOpen) await this.closeCurrentPort()

    return new Promise<string>((resolve, reject) => {
      const decoder = new TextDecoder('utf-8')
      let settled = false
      let port: SerialPort
      port = new SerialPort(options, (error) => {
        if (!error) return
        if (this.currentPort === port) this.currentPort = undefined
        settled = true
        reject(error)
      })
      this.currentPort = port

      port.once('open', () => {
        settled = true
        resolve(`串口${options.path}打开成功`)
      })
      port.on('data', (chunk: Uint8Array) => {
        callbacks.onData(
          this.dataFormat === 'hex' ? toHex(chunk) : decoder.decode(chunk, { stream: true }),
        )
      })
      port.on('error', (error) => {
        if (this.currentPort === port) this.currentPort = undefined
        if (!settled) {
          settled = true
          reject(error)
        }
      })
      port.once('close', () => {
        const wasIntentional = this.intentionalClose
        this.intentionalClose = false
        if (this.currentPort === port) this.currentPort = undefined
        if (!wasIntentional) callbacks.onDisconnected(options.path)
      })
    })
  }

  public async close(options: Pick<SerialPortOptions, 'path'>): Promise<void> {
    if (this.currentPort?.path !== options.path || !this.currentPort.isOpen) return
    await this.closeCurrentPort()
  }

  public setDataFormat(format: string): void {
    this.dataFormat = format === 'hex' ? 'hex' : 'ascii'
  }

  public async send(data: string, format: SerialDataFormat): Promise<void> {
    const port = this.currentPort
    if (!port?.isOpen) throw new Error('串口未打开或不可用')
    const buffer = Buffer.from(data, format === 'hex' ? 'hex' : 'utf8')
    await new Promise<void>((resolve, reject) => {
      // write 的回调只表示数据交给了 OS 缓冲，drain 才会等到数据真正写入设备；
      // 设备掉线/权限错误（如 Windows 上 GetOverlappedResult 失败）会在 drain 阶段抛出
      port.write(buffer, (writeError) => {
        if (writeError) {
          reject(writeError)
          return
        }
        port.drain((drainError) => (drainError ? reject(drainError) : resolve()))
      })
    })
  }

  private async closeCurrentPort(): Promise<void> {
    const port = this.currentPort
    if (!port?.isOpen) {
      this.currentPort = undefined
      return
    }

    this.intentionalClose = true
    await new Promise<void>((resolve, reject) => {
      port.close((error) => (error ? reject(error) : resolve()))
    })
    if (this.currentPort === port) this.currentPort = undefined
  }
}

function toHex(chunk: Uint8Array): string {
  return Array.from(chunk, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('')
}
