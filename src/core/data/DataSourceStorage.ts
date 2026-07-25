import { JsonStorage } from '@/core/storage/JsonStorage'

export const DATA_SOURCE_SETTINGS_KEY = 'nav-tools:data-source-settings'
export const LEGACY_CAMERA_STREAM_URL_KEY = 'nav-tools:camera-stream-url'
export const DEFAULT_CAMERA_STREAM_URL = 'rtsp://192.168.3.14:8554/rgbstream'

export type TextDataParser = 'raw' | 'json' | 'nmea'

export interface DataSourceSettings {
  version: 1
  serial: {
    port: string
    baudRate: string
    dataBits: string
    stopBits: string
    parity: string
    advanced: boolean
    parser: TextDataParser
  }
  file: {
    path: string
    parser: TextDataParser
    timeTag: boolean
    replaySpeed: number
    startOffset: number
    filePositionBytes: 4 | 8
  }
  network: {
    protocol: 'tcp' | 'udp'
    host: string
    port?: number
    parser: TextDataParser
  }
  camera: {
    url: string
  }
}

export function createDefaultDataSourceSettings(
  cameraUrl = DEFAULT_CAMERA_STREAM_URL,
): DataSourceSettings {
  return {
    version: 1,
    serial: {
      port: '',
      baudRate: '115200',
      dataBits: '8',
      stopBits: '1',
      parity: 'none',
      advanced: false,
      parser: 'raw',
    },
    file: {
      path: '',
      parser: 'raw',
      timeTag: false,
      replaySpeed: 1,
      startOffset: 0,
      filePositionBytes: 4,
    },
    network: {
      protocol: 'tcp',
      host: '127.0.0.1',
      port: undefined,
      parser: 'raw',
    },
    camera: {
      url: normalizeRtspUrl(cameraUrl) ?? DEFAULT_CAMERA_STREAM_URL,
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
  return value === 'raw' || value === 'json' || value === 'nmea' ? value : fallback
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

export function normalizeRtspUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value.trim())
    return url.protocol === 'rtsp:' && Boolean(url.hostname) ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function normalizeSettings(value: unknown, legacyCameraUrl?: string): DataSourceSettings {
  const defaults = createDefaultDataSourceSettings(legacyCameraUrl)
  if (!isRecord(value)) return defaults

  const serial = isRecord(value.serial) ? value.serial : {}
  const file = isRecord(value.file) ? value.file : {}
  const network = isRecord(value.network) ? value.network : {}
  const camera = isRecord(value.camera) ? value.camera : {}

  return {
    version: 1,
    serial: {
      port: stringValue(serial.port, defaults.serial.port),
      baudRate: stringValue(serial.baudRate, defaults.serial.baudRate),
      dataBits: stringValue(serial.dataBits, defaults.serial.dataBits),
      stopBits: stringValue(serial.stopBits, defaults.serial.stopBits),
      parity: stringValue(serial.parity, defaults.serial.parity),
      advanced: typeof serial.advanced === 'boolean' ? serial.advanced : defaults.serial.advanced,
      parser: parserValue(serial.parser, defaults.serial.parser),
    },
    file: {
      path: stringValue(file.path, defaults.file.path),
      parser: parserValue(file.parser, defaults.file.parser),
      timeTag: typeof file.timeTag === 'boolean' ? file.timeTag : defaults.file.timeTag,
      replaySpeed: positiveNumber(file.replaySpeed, defaults.file.replaySpeed),
      startOffset: nonNegativeNumber(file.startOffset, defaults.file.startOffset),
      filePositionBytes: file.filePositionBytes === 8 ? 8 : 4,
    },
    network: {
      protocol: network.protocol === 'udp' ? 'udp' : 'tcp',
      host: stringValue(network.host, defaults.network.host),
      port: portValue(network.port),
      parser: parserValue(network.parser, defaults.network.parser),
    },
    camera: {
      url: normalizeRtspUrl(camera.url) ?? defaults.camera.url,
    },
  }
}

export class DataSourceStorage {
  public constructor(private readonly storage: JsonStorage) {}

  public load(): DataSourceSettings {
    const saved = this.storage.read<unknown>(DATA_SOURCE_SETTINGS_KEY, undefined)
    const legacyCameraUrl = this.storage.readRaw(LEGACY_CAMERA_STREAM_URL_KEY) ?? undefined
    const settings = normalizeSettings(saved, legacyCameraUrl)

    if (saved === undefined) this.save(settings)
    return settings
  }

  public save(settings: DataSourceSettings): void {
    this.storage.write(DATA_SOURCE_SETTINGS_KEY, normalizeSettings(settings))
  }
}
