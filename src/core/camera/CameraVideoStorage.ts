import { JsonStorage } from '@/core/storage/JsonStorage'

export const CAMERA_VIDEO_SETTINGS_KEY = 'nav-tools:camera-video'

const LEGACY_CAMERA_STREAM_URL_KEY = 'nav-tools:camera-stream-url'
const LEGACY_DATA_SOURCE_SETTINGS_KEY = 'nav-tools:data-source-settings'

export const DEFAULT_CAMERA_STREAM_PROTOCOL = 'rtsp'
export const DEFAULT_CAMERA_STREAM_PORT = 8554
export const DEFAULT_CAMERA_STREAM_SUFFIX = 'rgbstream'
export const DEFAULT_CAMERA_STREAM_URL = 'rtsp://192.168.3.14:8554/rgbstream'

export interface CameraVideoSettings {
  version: 1
  /** 流协议（如 rtsp）；IP 来自数据接入 NETWORK 配置，不在此保存 */
  protocol: string
  port: number
  /** 流路径后缀（不含开头的 /） */
  suffix: string
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

/** 由协议/端口/后缀与共享 NETWORK 主机拼出完整流地址 */
export function buildCameraStreamUrl(
  settings: Pick<CameraVideoSettings, 'protocol' | 'port' | 'suffix'>,
  host: string,
): string | undefined {
  const trimmedHost = host.trim()
  if (!trimmedHost) return undefined
  return `${settings.protocol}://${trimmedHost}:${settings.port}/${settings.suffix}`
}

function protocolValue(value: unknown): string {
  return typeof value === 'string' && /^[a-z][a-z0-9+.-]*$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : DEFAULT_CAMERA_STREAM_PROTOCOL
}

function portValue(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535
    ? value
    : DEFAULT_CAMERA_STREAM_PORT
}

function suffixValue(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CAMERA_STREAM_SUFFIX
  const trimmed = value.trim().replace(/^\/+/, '')
  return trimmed || DEFAULT_CAMERA_STREAM_SUFFIX
}

/** 从旧版完整流地址拆出协议/端口/后缀（主机部分废弃，改由数据接入提供） */
function partsFromLegacyUrl(url: string): Partial<CameraVideoSettings> {
  try {
    const parsed = new URL(url)
    return {
      protocol: parsed.protocol.replace(/:$/, '') || undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      suffix: parsed.pathname.replace(/^\/+/, '') || undefined,
    }
  } catch {
    return {}
  }
}

function readLegacyUnifiedUrl(storage: JsonStorage): string | undefined {
  const legacySettings = storage.read<unknown>(LEGACY_DATA_SOURCE_SETTINGS_KEY, undefined)
  if (!legacySettings || typeof legacySettings !== 'object' || Array.isArray(legacySettings)) {
    return undefined
  }

  const camera = (legacySettings as Record<string, unknown>).camera
  if (!camera || typeof camera !== 'object' || Array.isArray(camera)) return undefined
  return normalizeRtspUrl((camera as Record<string, unknown>).url)
}

function normalizeSettings(value: unknown, fallbackUrl?: string): CameraVideoSettings {
  const saved =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  const legacy = partsFromLegacyUrl(
    normalizeRtspUrl(saved.streamUrl) ?? normalizeRtspUrl(fallbackUrl) ?? '',
  )

  return {
    version: 1,
    protocol: protocolValue(saved.protocol ?? legacy.protocol),
    port: portValue(saved.port ?? legacy.port),
    suffix: suffixValue(saved.suffix ?? legacy.suffix),
  }
}

export class CameraVideoStorage {
  public constructor(private readonly storage: JsonStorage) {}

  public load(): CameraVideoSettings {
    const saved = this.storage.read<unknown>(CAMERA_VIDEO_SETTINGS_KEY, undefined)
    if (saved !== undefined) {
      const settings = normalizeSettings(saved)
      if (JSON.stringify(saved) !== JSON.stringify(settings)) this.save(settings)
      return settings
    }

    const legacyUrl =
      readLegacyUnifiedUrl(this.storage) ??
      normalizeRtspUrl(this.storage.readRaw(LEGACY_CAMERA_STREAM_URL_KEY))
    const settings = normalizeSettings(undefined, legacyUrl)
    this.save(settings)
    return settings
  }

  public save(settings: CameraVideoSettings): void {
    this.storage.write(CAMERA_VIDEO_SETTINGS_KEY, normalizeSettings(settings))
  }
}
