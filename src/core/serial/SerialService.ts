import type { IpcTransport } from '../platform/IpcTransport'

export type SerialDataFormat = 'ascii' | 'hex'
export type SerialParity = 'none' | 'even' | 'odd'
export type SerialDataBits = 5 | 6 | 7 | 8
export type SerialStopBits = 1 | 1.5 | 2

export interface SerialPortOptions {
  path: string
  baudRate: number
  dataBits: SerialDataBits
  stopBits: SerialStopBits
  parity: SerialParity
}

export interface SerialDisconnectEvent {
  path: string
}

export function extractSerialPortPath(label: string): string {
  const match = label.match(/\b([A-Z]+\d+(?:[A-Z]*\d*)*)\b(?=->|$|\))/i)
  return match?.[1] ?? ''
}

export class SerialService {
  public constructor(private readonly ipc: IpcTransport) {}

  public listPorts(): Promise<string[]> {
    return this.ipc.invoke<string[]>('search-serial-ports')
  }

  public open(options: SerialPortOptions): Promise<string> {
    return this.ipc.invoke<string>('open-serial-port', options)
  }

  public close(options: SerialPortOptions): Promise<void> {
    return this.ipc.invoke<void>('close-serial-port', options)
  }

  public setDataFormat(format: SerialDataFormat): void {
    this.ipc.send('serial-data-format', format)
  }

  public send(data: string, format: SerialDataFormat): void {
    this.ipc.send(format === 'hex' ? 'send-serial-hex-data' : 'send-serial-ascii-data', data)
  }

  public onData(listener: (data: string) => void): () => void {
    return this.ipc.on('serial-data-to-renderer', (_event, data) => listener(String(data)))
  }

  public onDisconnected(listener: (event: SerialDisconnectEvent) => void): () => void {
    return this.ipc.on('serial-disconnected', (_event, payload) => {
      if (isSerialDisconnectEvent(payload)) listener(payload)
    })
  }
}

function isSerialDisconnectEvent(value: unknown): value is SerialDisconnectEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SerialDisconnectEvent).path === 'string'
  )
}
