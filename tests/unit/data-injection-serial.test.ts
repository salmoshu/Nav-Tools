// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SerialPortMock } from 'serialport'
import { SerialPortService } from '../../electron/main/services/SerialPortService'
import { DataInjectionService } from '../../electron/main/services/DataInjectionService'
import { createDefaultInjectionSettings } from '../../src/core/data/DataInjection'

const ports = vi.hoisted(() => new Map<string, import('serialport').SerialPortMock>())
vi.mock('serialport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('serialport')>()
  return {
    ...actual,
    SerialPort: class extends actual.SerialPortMock {
      public constructor(...args: ConstructorParameters<typeof actual.SerialPortMock>) {
        super(...args)
        ports.set(args[0].path, this)
      }
    },
  }
})

const primary = new SerialPortService()
const service = new DataInjectionService(() => {
  const info = primary.getConnectionInfo()
  return info
    ? {
        id: info.path,
        label: info.path,
        serialPath: info.path,
        write: (data) => primary.sendBuffer(data),
      }
    : undefined
})
afterEach(async () => {
  await service.stop()
  await primary.close({ path: 'COM7' })
  SerialPortMock.binding.reset()
  ports.clear()
})

describe('independent serial injection connections', () => {
  it('reads binary data from B, drains it into A and leaves A open when B stops', async () => {
    SerialPortMock.binding.createPort('COM7', { record: true })
    SerialPortMock.binding.createPort('COM8', { record: true })
    await primary.open(
      { path: 'COM7', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' },
      { onData: vi.fn(), onDisconnected: vi.fn() },
    )
    const settings = createDefaultInjectionSettings()
    settings.source = 'serial'
    settings.serial.path = 'COM8'
    await service.start(settings)
    const packet = Buffer.from([0xd3, 0, 0xff, 0x80, 13, 10])
    ports.get('COM8')!.port!.emitData(packet)
    await vi.waitFor(() => expect(ports.get('COM7')!.port!.recording).toEqual(packet))
    expect(service.getStatus().forwardedBytes).toBe(packet.length)
    await service.stop()
    expect(ports.get('COM8')!.isOpen).toBe(false)
    expect(primary.getConnectionInfo()?.path).toBe('COM7')
    expect(ports.get('COM7')!.isOpen).toBe(true)
  })
})
