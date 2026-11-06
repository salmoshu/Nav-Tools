import type { DataInjectionSettings } from '../../../src/core/data/DataInjection'
import { NetworkConnectionService } from './NetworkConnectionService'
import { SerialPortService } from './SerialPortService'
import { NtripConnection } from './NtripConnection'

export interface InjectionConnection {
  open(onData: (data: Uint8Array) => void, onDisconnected: (reason: string) => void): Promise<void>
  close(): Promise<void>
  send(data: Uint8Array): Promise<void>
}

export function createInjectionConnection(settings: DataInjectionSettings): InjectionConnection {
  if (settings.source === 'network' && settings.network.protocol === 'ntrip')
    return new NtripConnection(settings.network)
  if (settings.source === 'serial') {
    const serial = new SerialPortService()
    let closed = false
    let unsubscribe: (() => void) | undefined
    return {
      async open(onData, onDisconnected) {
        unsubscribe = serial.onRawData(onData)
        serial.onError((error) => onDisconnected(error.message))
        await serial.open(settings.serial, {
          onData: () => undefined,
          onDisconnected: () => onDisconnected('Injection serial port disconnected'),
        })
        if (closed) {
          await serial.close(settings.serial)
          throw new Error('Injection connection cancelled')
        }
      },
      async close() {
        closed = true
        unsubscribe?.()
        await serial.close(settings.serial)
      },
      send: (data) => serial.sendBuffer(data),
    }
  }
  const network = new NetworkConnectionService()
  let unsubscribe: (() => void) | undefined
  return {
    async open(onData, onDisconnected) {
      unsubscribe = network.onRawData(onData)
      await network.open(
        {
          protocol: settings.network.protocol === 'udp' ? 'udp' : 'tcp',
          host: settings.network.host.trim(),
          port: settings.network.port,
        },
        {
          onData: () => undefined,
          onDisconnected: (_options, reason) =>
            onDisconnected(reason ?? 'Injection network disconnected'),
        },
      )
    },
    async close() {
      unsubscribe?.()
      network.cancelPending()
      await network.close()
    },
    send: (data) => network.sendBuffer(data),
  }
}
