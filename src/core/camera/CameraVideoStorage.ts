import { JsonStorage } from '@/core/storage/JsonStorage'

export const CAMERA_VIDEO_SETTINGS_KEY = 'nav-tools:camera-video'
export const DEFAULT_CAMERA_STREAM_URL = 'rtsp://192.168.3.14:8554/rgbstream'

const LEGACY_CAMERA_STREAM_URL_KEY = 'nav-tools:camera-stream-url'
const LEGACY_DATA_SOURCE_SETTINGS_KEY = 'nav-tools:data-source-settings'

export interface CameraVideoSettings {
  version: 1
  streamUrl: string
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

  return {
    version: 1,
    streamUrl:
      normalizeRtspUrl(saved.streamUrl) ??
      normalizeRtspUrl(fallbackUrl) ??
      DEFAULT_CAMERA_STREAM_URL,
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
