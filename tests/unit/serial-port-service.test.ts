import { describe, expect, it, vi, beforeEach } from 'vitest'

// serialport 会加载原生模块，单元测试中整体 mock 掉
vi.mock('serialport', () => ({
  SerialPort: vi.fn(),
}))

import { SerialPortService } from '../../electron/main/services/SerialPortService'
import { SerialPort } from 'serialport'

interface FakePort {
  isOpen: boolean
  write: ReturnType<typeof vi.fn>
  drain: ReturnType<typeof vi.fn>
}

function injectPort(service: SerialPortService, port: FakePort) {
  // @ts-expect-error -- 直接注入私有字段，避免打开真实串口
  service.currentPort = port
}

describe('SerialPortService.send', () => {
  let service: SerialPortService
  let port: FakePort

  beforeEach(() => {
    service = new SerialPortService()
    port = {
      isOpen: true,
      write: vi.fn((_buf: Buffer, cb: (err?: Error | null) => void) => cb(null)),
      drain: vi.fn((cb: (err?: Error | null) => void) => cb(null)),
    }
    injectPort(service, port)
  })

  it('rejects when the port is not open', async () => {
    port.isOpen = false
    await expect(service.send('AA', 'hex')).rejects.toThrow('串口未打开或不可用')
    expect(port.write).not.toHaveBeenCalled()
  })

  it('writes then drains on success', async () => {
    await service.send('0A0B', 'hex')

    expect(port.write).toHaveBeenCalledTimes(1)
    expect(port.write.mock.calls[0][0]).toEqual(Buffer.from([0x0a, 0x0b]))
    expect(port.drain).toHaveBeenCalledTimes(1)
  })

  it('rejects on write error without draining', async () => {
    port.write.mockImplementation((_buf: Buffer, cb: (err?: Error | null) => void) =>
      cb(new Error('write failed')),
    )

    await expect(service.send('AA', 'hex')).rejects.toThrow('write failed')
    expect(port.drain).not.toHaveBeenCalled()
  })

  it('rejects on drain error (e.g. device lost / permission error mid-transfer)', async () => {
    port.drain.mockImplementation((cb: (err?: Error | null) => void) =>
      cb(new Error('GetOverlappedResult failed (Access is denied.)')),
    )

    await expect(service.send('AA', 'hex')).rejects.toThrow('GetOverlappedResult failed')
  })

  it('sends ascii data as utf8 buffer', async () => {
    await service.send('hello', 'ascii')
    expect(port.write.mock.calls[0][0]).toEqual(Buffer.from('hello', 'utf8'))
  })
})

describe('SerialPortService signal levels', () => {
  function mockPort(baudRate: number): { set: ReturnType<typeof vi.fn> } {
    const port = {
      isOpen: true,
      baudRate,
      on: vi.fn(),
      once: vi.fn((event: string, callback: () => void) => {
        if (event === 'open') callback()
      }),
      set: vi.fn((_options: unknown, callback: (error?: Error | null) => void) => callback(null)),
    }
    vi.mocked(SerialPort).mockImplementation(() => port as unknown as SerialPort)
    return port
  }

  const callbacks = { onData: vi.fn(), onDisconnected: vi.fn() }

  it('applies configured RTS and DTR after opening the port', async () => {
    const service = new SerialPortService()
    const port = mockPort(12800)
    await service.open(
      {
        path: 'COM4',
        baudRate: 12800,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        rts: true,
        dtr: false,
      },
      callbacks,
    )

    expect(port.set).toHaveBeenCalledWith({ dtr: false, rts: true }, expect.any(Function))
    expect(service.getConnectionInfo()).toMatchObject({
      baudRate: 12800,
      rts: true,
      dtr: false,
    })
  })

  it('preserves legacy signal defaults when options do not include them', async () => {
    const service = new SerialPortService()
    const port = mockPort(115200)
    await service.open(
      { path: 'COM5', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' },
      callbacks,
    )

    expect(port.set).toHaveBeenCalledWith({ dtr: true, rts: false }, expect.any(Function))
  })
})
