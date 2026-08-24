import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(async () => Buffer.from([0x11, 0x22, 0x33, 0x44, 0x55])),
  },
}))

vi.mock('serialport', () => ({ SerialPort: vi.fn() }))

import { IapUpgradeService } from '../../electron/main/services/IapUpgradeService'
import type {
  SerialPortOptions,
  SerialPortService,
} from '../../electron/main/services/SerialPortService'
import { calculateChecksum, IGK_IAP_TEMPLATE, type IapProtocolConfig } from '@/core/iap/IapProtocol'
import type { IapUpgradeEvent } from '@/core/iap/IapUpgrade'

const connection: SerialPortOptions = {
  path: 'COM7',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
}

class FakeSerialPortService {
  readonly sent: Uint8Array[] = []
  readonly restored: SerialPortOptions[] = []
  sendFailure: Error | undefined
  respondToData = true
  private readonly dataListeners = new Set<(data: Uint8Array) => void>()
  private readonly errorListeners = new Set<(error: Error) => void>()
  private readonly disconnectListeners = new Set<(path: string) => void>()

  getConnectionInfo(): SerialPortOptions {
    return { ...connection }
  }
  async updateBaudRate(): Promise<void> {}
  async restoreConnection(options: SerialPortOptions): Promise<void> {
    this.restored.push({ ...options })
  }

  async sendBuffer(frame: Uint8Array): Promise<void> {
    this.sent.push(frame.slice())
    if (this.sendFailure) throw this.sendFailure
    if (frame[1] === 0x01) this.emitData(withCrc(Uint8Array.of(0xf1, 0x81, 0x00, 0x00)))
    if ((frame[1] === 0x02 || frame[1] === 0x03) && this.respondToData) {
      this.emitData(withCrc(Uint8Array.of(0xf1, 0x82, frame[2], frame[3], 0x01)))
    }
  }

  onRawData(listener: (data: Uint8Array) => void): () => void {
    this.dataListeners.add(listener)
    return () => this.dataListeners.delete(listener)
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  onDisconnected(listener: (path: string) => void): () => void {
    this.disconnectListeners.add(listener)
    return () => this.disconnectListeners.delete(listener)
  }

  private emitData(data: Uint8Array): void {
    for (const listener of this.dataListeners) listener(data)
  }
}

function withCrc(body: Uint8Array): Uint8Array {
  const checksum = calculateChecksum(body, 'crc32', 'big')
  return Uint8Array.from([...body, ...checksum])
}

function createOwner(events: IapUpgradeEvent[]) {
  return {
    isDestroyed: () => false,
    send: (_channel: string, event: IapUpgradeEvent) => events.push(event),
  }
}

function start(
  service: IapUpgradeService,
  owner: ReturnType<typeof createOwner>,
  overrides: Partial<IapProtocolConfig> = {},
): void {
  service.start(owner as never, {
    filePath: '/virtual/firmware.bin',
    fileName: 'firmware.bin',
    protocolName: 'IGK IAP',
    config: { ...IGK_IAP_TEMPLATE.config, packageSize: 4, timeoutMs: 10, ...overrides },
  })
}

describe('IapUpgradeService', () => {
  let serial: FakeSerialPortService
  let service: IapUpgradeService
  let events: IapUpgradeEvent[]

  beforeEach(() => {
    serial = new FakeSerialPortService()
    service = new IapUpgradeService(serial as unknown as SerialPortService)
    events = []
  })

  it('reaches 100% only after valid device ACKs and restores the original serial settings', async () => {
    start(service, createOwner(events))

    await vi.waitFor(() => expect(service.getSnapshot().phase).toBe('success'))

    expect(service.getSnapshot()).toMatchObject({
      progress: 100,
      totalPackets: 2,
      acknowledgedPackets: 2,
      sentPackets: 2,
      error: null,
    })
    expect(serial.sent.map((frame) => frame[1])).toEqual([0x01, 0x02, 0x03])
    expect(serial.restored).toEqual([connection])
    expect(
      events.some((event) => event.type === 'state' && event.snapshot.phase === 'success'),
    ).toBe(true)
  })

  it('reports a write/permission failure instead of completing the progress bar', async () => {
    serial.sendFailure = new Error("GetOverlappedResult failed (PermissionError(13, '拒绝访问。'))")
    start(service, createOwner(events))

    await vi.waitFor(() => expect(service.getSnapshot().phase).toBe('error'))

    expect(service.getSnapshot()).toMatchObject({
      progress: 0,
      acknowledgedPackets: 0,
      sentPackets: 0,
    })
    expect(service.getSnapshot().error).toContain('GetOverlappedResult failed')
    expect(serial.restored).toEqual([connection])
  })

  it('stops at 0% when the packet ACK times out', async () => {
    serial.respondToData = false
    start(service, createOwner(events), { maxRetries: 0 })

    await vi.waitFor(() => expect(service.getSnapshot().phase).toBe('error'))

    expect(service.getSnapshot()).toMatchObject({
      progress: 0,
      acknowledgedPackets: 0,
      sentPackets: 1,
      timeoutRetryCount: 1,
    })
    expect(service.getSnapshot().error).toContain('等待第 1 包应答超时')
  })
})
