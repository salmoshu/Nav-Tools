import { describe, expect, it, vi } from 'vitest'
import { IncomingDataRouter } from '@/core/data/IncomingDataRouter'
import { ActiveDataTransport } from '@/core/device/ActiveDataTransport'
import {
  NmeaStreamParser,
  calculateNmeaChecksum,
  validateNmeaChecksum,
} from '@/core/data/NmeaStreamParser'
import type { IpcListener, IpcTransport } from '@/core/platform/IpcTransport'
import { NetworkService, validateNetworkOptions } from '@/core/network/NetworkService'
import { SerialService, extractSerialPortPath } from '@/core/serial/SerialService'
import { resolveTheme } from '@/core/theme/theme'

class MockIpc implements IpcTransport {
  public listeners = new Map<string, IpcListener>()
  public invoke = vi.fn(async () => [])
  public send = vi.fn()

  public on(channel: string, listener: IpcListener): () => void {
    this.listeners.set(channel, listener)
    return () => this.listeners.delete(channel)
  }
}

describe('SerialService', () => {
  it('normalizes a Windows friendly port label and delegates IPC calls', async () => {
    const ipc = new MockIpc()
    const service = new SerialService(ipc)
    expect(extractSerialPortPath('USB Serial Device (COM12)')).toBe('COM12')
    await service.listPorts()
    expect(ipc.invoke).toHaveBeenCalledWith('search-serial-ports')
  })

  it('delivers serial data through a removable subscription', () => {
    const ipc = new MockIpc()
    const listener = vi.fn()
    const remove = new SerialService(ipc).onData(listener)
    ipc.listeners.get('serial-data-to-renderer')?.({}, 'payload')
    expect(listener).toHaveBeenCalledWith('payload')
    remove()
    expect(ipc.listeners.has('serial-data-to-renderer')).toBe(false)
  })
})

describe('NetworkService', () => {
  it('validates endpoints and delegates TCP/UDP connections', async () => {
    const ipc = new MockIpc()
    const service = new NetworkService(ipc)
    const options = { protocol: 'udp' as const, host: '0.0.0.0', port: 9000 }
    expect(validateNetworkOptions(options)).toBeUndefined()
    expect(validateNetworkOptions({ ...options, port: 70000 })).toContain('65535')
    await service.open(options)
    expect(ipc.invoke).toHaveBeenCalledWith('open-network-connection', options)
  })

  it('selects the send channel for the active transport', () => {
    const transport = new ActiveDataTransport()
    expect(transport.sendChannel('ascii')).toBeUndefined()
    transport.activate('network')
    expect(transport.sendChannel('hex')).toBe('send-network-hex-data')
    transport.clear('network')
    expect(transport.current).toBeUndefined()
  })
})

describe('IncomingDataRouter', () => {
  it('decodes motor hex once and routes it to active panels', () => {
    const targets = {
      appendGnss: vi.fn(),
      appendRaw: vi.fn(),
      appendPlot: vi.fn(),
      decodeMotorHex: vi.fn(() => '{"speed":1}\n'),
    }
    const router = new IncomingDataRouter(targets)
    router.route('AABB', {
      activeDataModes: ['motor'],
      activeWindowIds: ['raw-messages', 'plot'],
      displayFormat: 'hex',
    })
    expect(targets.decodeMotorHex).toHaveBeenCalledOnce()
    expect(targets.appendRaw).toHaveBeenCalledWith('AABB\n{"speed":1}\n')
    expect(targets.appendPlot).toHaveBeenCalledWith('{"speed":1}\n')
  })
})

describe('NMEA and theme utilities', () => {
  it('validates checksums and preserves incomplete stream chunks', () => {
    const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,'
    const complete = `${sentence}*${calculateNmeaChecksum(sentence)}`
    expect(validateNmeaChecksum(complete)).toBe(true)

    const parser = new NmeaStreamParser()
    expect(parser.push(complete.slice(0, 20))).toEqual([])
    expect(parser.push(complete.slice(20))).toEqual([complete])
  })

  it('resolves system theme without depending on Vue or the DOM', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})
