import { JsonStorage } from '@/core/storage/JsonStorage'

export const CAMERA_PARAMETERS_SETTINGS_KEY = 'nav-tools:camera-parameters'

export const CAMERA_SUB_COMMANDS = [
  'read_params',
  'read_version',
  'set_params',
  'start_follow',
  'bbox_draw',
  'read_imu',
  'read_range',
  'set_range',
] as const

export type CameraSubCommand = (typeof CAMERA_SUB_COMMANDS)[number] | ''

export interface CameraParametersSettings {
  version: 1
  subCommand: CameraSubCommand
  content: string
  contentIsHex: boolean
}

export function createDefaultCameraParametersSettings(): CameraParametersSettings {
  return {
    version: 1,
    subCommand: '',
    content: '',
    contentIsHex: false,
  }
}

function normalizeSettings(value: unknown): CameraParametersSettings {
  const defaults = createDefaultCameraParametersSettings()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults

  const saved = value as Record<string, unknown>
  const subCommand =
    typeof saved.subCommand === 'string' &&
    (saved.subCommand === '' ||
      CAMERA_SUB_COMMANDS.includes(saved.subCommand as (typeof CAMERA_SUB_COMMANDS)[number]))
      ? (saved.subCommand as CameraSubCommand)
      : defaults.subCommand

  return {
    version: 1,
    subCommand,
    content: typeof saved.content === 'string' ? saved.content : defaults.content,
    contentIsHex:
      typeof saved.contentIsHex === 'boolean' ? saved.contentIsHex : defaults.contentIsHex,
  }
}

export class CameraParametersStorage {
  public constructor(private readonly storage: JsonStorage) {}

  public load(): CameraParametersSettings {
    return normalizeSettings(this.storage.read<unknown>(CAMERA_PARAMETERS_SETTINGS_KEY, undefined))
  }

  public save(settings: CameraParametersSettings): void {
    this.storage.write(CAMERA_PARAMETERS_SETTINGS_KEY, normalizeSettings(settings))
  }
}
