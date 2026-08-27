import type { IpcTransport } from '../platform/IpcTransport'
import { t } from '@/i18n'

export type NetworkProtocol = 'tcp' | 'udp'

export interface NetworkConnectionOptions {
  protocol: NetworkProtocol
  host: string
  port: number
}

export interface NetworkDisconnectEvent extends NetworkConnectionOptions {
  reason?: string
}

export function validateNetworkOptions(options: NetworkConnectionOptions): string | undefined {
  if (options.protocol !== 'tcp' && options.protocol !== 'udp')
    return t('core.network.protocolRequired')
  if (!options.host.trim()) {
    return options.protocol === 'tcp'
      ? t('core.network.remoteHostRequired')
      : t('core.network.listenHostRequired')
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
    return t('core.network.portRange')
  }
  return undefined
}

export class NetworkService {
  public constructor(private readonly ipc: IpcTransport) {}

  public open(options: NetworkConnectionOptions): Promise<void> {
    return this.ipc.invoke<void>('open-network-connection', options)
  }

  public close(): Promise<void> {
    return this.ipc.invoke<void>('close-network-connection')
  }

  public onData(listener: (data: string) => void): () => void {
    return this.ipc.on('network-data-to-renderer', (_event, data) => listener(String(data)))
  }

  public onDisconnected(listener: (event: NetworkDisconnectEvent) => void): () => void {
    return this.ipc.on('network-disconnected', (_event, payload) => {
      if (isNetworkDisconnectEvent(payload)) listener(payload)
    })
  }
}

function isNetworkDisconnectEvent(value: unknown): value is NetworkDisconnectEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as NetworkDisconnectEvent
  return (
    (event.protocol === 'tcp' || event.protocol === 'udp') &&
    typeof event.host === 'string' &&
    typeof event.port === 'number'
  )
}
