import { JsonStorage } from '../storage/JsonStorage'

export const DATA_INJECTION_SETTINGS_KEY = 'nav-tools:data-injection-settings'

export interface DataInjectionSettings {
  source: 'serial' | 'network'
  serial: {
    path: string
    baudRate: number
    dataBits: 5 | 6 | 7 | 8
    stopBits: 1 | 1.5 | 2
    parity: 'none' | 'even' | 'odd'
  }
  network: {
    protocol: 'tcp' | 'udp' | 'ntrip'
    host: string
    port: number
    mountpoint: string
    username: string
    password: string
    sendGga: boolean
    ggaInterval: number
  }
  autoReconnect: boolean
}

export interface DataInjectionStatus {
  state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  receivedBytes: number
  forwardedBytes: number
  ggaSent: number
  target?: string
  error?: string
}

export function createDefaultInjectionSettings(): DataInjectionSettings {
  return {
    source: 'network',
    serial: { path: '', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' },
    network: {
      protocol: 'ntrip',
      host: '',
      port: 2101,
      mountpoint: '',
      username: '',
      password: '',
      sendGga: true,
      ggaInterval: 5,
    },
    autoReconnect: true,
  }
}

export function validateInjectionSettings(value: DataInjectionSettings): string | undefined {
  if (value.source !== 'serial' && value.source !== 'network') return 'Invalid injection source'
  if (value.source === 'serial') {
    const serial = value.serial
    if (!serial || typeof serial.path !== 'string' || !serial.path.trim())
      return 'Select an injection serial port'
    if (!Number.isInteger(serial.baudRate) || serial.baudRate < 1 || serial.baudRate > 4000000)
      return 'Invalid injection baud rate'
    if (
      ![5, 6, 7, 8].includes(serial.dataBits) ||
      ![1, 1.5, 2].includes(serial.stopBits) ||
      !['none', 'even', 'odd'].includes(serial.parity)
    )
      return 'Invalid injection serial options'
  } else {
    const network = value.network
    if (!network || !['tcp', 'udp', 'ntrip'].includes(network.protocol))
      return 'Invalid injection protocol'
    if (
      typeof network.host !== 'string' ||
      !network.host.trim() ||
      /\s/.test(network.host.trim()) ||
      hasControlCharacters(network.host)
    )
      return 'Enter a valid injection host'
    if (!Number.isInteger(network.port) || network.port < 1 || network.port > 65535)
      return 'Injection port must be between 1 and 65535'
    if (network.protocol === 'ntrip') {
      if (
        typeof network.mountpoint !== 'string' ||
        !network.mountpoint.replace(/^\/+/, '').trim() ||
        hasControlCharacters(network.mountpoint)
      )
        return 'Enter a valid NTRIP mountpoint'
      if (typeof network.username !== 'string' || typeof network.password !== 'string')
        return 'Invalid NTRIP credentials'
      if (
        !Number.isFinite(network.ggaInterval) ||
        network.ggaInterval < 1 ||
        network.ggaInterval > 3600
      )
        return 'GGA interval must be between 1 and 3600 seconds'
    }
  }
  return undefined
}

function hasControlCharacters(value: string): boolean {
  return [...value].some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  )
}

export function idleInjectionStatus(): DataInjectionStatus {
  return { state: 'idle', receivedBytes: 0, forwardedBytes: 0, ggaSent: 0 }
}

export class DataInjectionStorage {
  public constructor(private readonly storage: JsonStorage) {}

  public load(): DataInjectionSettings {
    const defaults = createDefaultInjectionSettings()
    const saved = this.storage.read<Partial<DataInjectionSettings>>(DATA_INJECTION_SETTINGS_KEY, {})
    if (!saved || typeof saved !== 'object') return defaults
    return {
      source: saved.source === 'serial' ? 'serial' : 'network',
      serial: normalizeFields(defaults.serial, saved.serial),
      network: { ...normalizeFields(defaults.network, saved.network), password: '' },
      autoReconnect: typeof saved.autoReconnect === 'boolean' ? saved.autoReconnect : true,
    }
  }

  public save(settings: DataInjectionSettings): void {
    this.storage.write(DATA_INJECTION_SETTINGS_KEY, {
      ...settings,
      network: { ...settings.network, password: '' },
    })
  }
}

function normalizeFields<T extends object>(defaults: T, saved: unknown): T {
  const normalized = { ...defaults }
  if (!saved || typeof saved !== 'object') return normalized
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = (saved as Partial<T>)[key]
    if (
      typeof value === typeof defaults[key] &&
      (typeof value !== 'number' || Number.isFinite(value))
    )
      normalized[key] = value as T[keyof T]
  }
  return normalized
}
