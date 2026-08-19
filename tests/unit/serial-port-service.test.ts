import { describe, expect, it, vi, beforeEach } from 'vitest'

// serialport 会加载原生模块，单元测试中整体 mock 掉
vi.mock('serialport', () => ({
  SerialPort: vi.fn(),
}))

import { SerialPortService } from '../../electron/main/services/SerialPortService'

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
