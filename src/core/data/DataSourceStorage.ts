import { JsonStorage } from '@/core/storage/JsonStorage'
import { DEFAULT_KEY_VALUE_REGEX, type TextDataParser } from '@/core/data/TextRecordParser'
import { CameraVideoStorage } from '@/core/camera/CameraVideoStorage'

export type { TextDataParser } from '@/core/data/TextRecordParser'

export const DATA_SOURCE_SETTINGS_KEY = 'nav-tools:data-source-settings'

export interface DataSourceSettings {
  version: 1
  activeSource: 'serial' | 'file' | 'network'
  serial: {
    port: string
    baudRate: string
    dataBits: string
    stopBits: string
    parity: string
    advanced: boolean
    parser: TextDataParser
    regexPattern: string
  }
  file: {
    path: string
    parser: TextDataParser
    regexPattern: string
    timeTag: boolean
    replaySpeed: number
    startOffset: number
    filePositionBytes: 4 | 8
  }
  network: {
    protocol: 'tcp' | 'udp'
    host: string
    port?: number
    loop: boolean
    parser: TextDataParser
    regexPattern: string
  }
}

export function createDefaultDataSourceSettings(): DataSourceSettings {
  return {
    version: 1,
    activeSource: 'file',
    serial: {
      port: '',
      baudRate: '115200',
      dataBits: '8',
      stopBits: '1',
      parity: 'none',
      advanced: false,
      parser: 'raw',
      regexPattern: DEFAULT_KEY_VALUE_REGEX,
    },
    file: {
      path: '',
      parser: 'raw',
      regexPattern: DEFAULT_KEY_VALUE_REGEX,
      timeTag: false,
      replaySpeed: 1,
      startOffset: 0,
      filePositionBytes: 4,
    },
    network: {
      protocol: 'tcp',
      host: '127.0.0.1',
      port: undefined,
      loop: false,
      parser: 'raw',
      regexPattern: DEFAULT_KEY_VALUE_REGEX,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function parserValue(value: unknown, fallback: TextDataParser): TextDataParser {
  return value === 'raw' ||
    value === 'json' ||
    value === 'nmea' ||
    value === 'regex' ||
    value === 'csv'
    ? value
    : fallback
}

function activeSourceValue(
  value: unknown,
  fallback: 'serial' | 'file' | 'network',
): 'serial' | 'file' | 'network' {
  return value === 'serial' || value === 'file' || value === 'network' ? value : fallback
}

function portValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535
    ? value
    : undefined
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function normalizeSettings(value: unknown): DataSourceSettings {
  const defaults = createDefaultDataSourceSettings()
  if (!isRecord(value)) return defaults

  const serial = isRecord(value.serial) ? value.serial : {}
  const file = isRecord(value.file) ? value.file : {}
  const network = isRecord(value.network) ? value.network : {}
  return {
    version: 1,
    activeSource: activeSourceValue(value.activeSource, defaults.activeSource),
    serial: {
      port: stringValue(serial.port, defaults.serial.port),
      baudRate: stringValue(serial.baudRate, defaults.serial.baudRate),
      dataBits: stringValue(serial.dataBits, defaults.serial.dataBits),
      stopBits: stringValue(serial.stopBits, defaults.serial.stopBits),
      parity: stringValue(serial.parity, defaults.serial.parity),
      advanced: typeof serial.advanced === 'boolean' ? serial.advanced : defaults.serial.advanced,
      parser: parserValue(serial.parser, defaults.serial.parser),
      regexPattern: stringValue(serial.regexPattern, defaults.serial.regexPattern),
    },
    file: {
      path: stringValue(file.path, defaults.file.path),
      parser: parserValue(file.parser, defaults.file.parser),
      regexPattern: stringValue(file.regexPattern, defaults.file.regexPattern),
      timeTag: typeof file.timeTag === 'boolean' ? file.timeTag : defaults.file.timeTag,
      replaySpeed: positiveNumber(file.replaySpeed, defaults.file.replaySpeed),
      startOffset: nonNegativeNumber(file.startOffset, defaults.file.startOffset),
      filePositionBytes: file.filePositionBytes === 8 ? 8 : 4,
    },
    network: {
      protocol: network.protocol === 'udp' ? 'udp' : 'tcp',
      host: stringValue(network.host, defaults.network.host),
      port: portValue(network.port),
      loop: typeof network.loop === 'boolean' ? network.loop : defaults.network.loop,
      parser: parserValue(network.parser, defaults.network.parser),
      regexPattern: stringValue(network.regexPattern, defaults.network.regexPattern),
    },
  }
}

export class DataSourceStorage {
  public constructor(private readonly storage: JsonStorage) {}

  public load(): DataSourceSettings {
    const saved = this.storage.read<unknown>(DATA_SOURCE_SETTINGS_KEY, undefined)
    if (isRecord(saved) && isRecord(saved.camera)) {
      new CameraVideoStorage(this.storage).load()
    }
    const settings = normalizeSettings(saved)

    if (saved === undefined || JSON.stringify(saved) !== JSON.stringify(settings)) {
      this.save(settings)
    }
    return settings
  }

  public save(settings: DataSourceSettings): void {
    this.storage.write(DATA_SOURCE_SETTINGS_KEY, normalizeSettings(settings))
  }
}
