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
  'set_calibParam',
  'read_calibParam',
] as const

export type CameraSubCommand = (typeof CAMERA_SUB_COMMANDS)[number] | ''

export interface CameraCommandContentSettings {
  content: string
  contentIsHex: boolean
}

export interface CameraParametersSettings {
  version: 2
  subCommand: CameraSubCommand
  commandSettings: Record<string, CameraCommandContentSettings>
}

function defaultsFor(subCommand: CameraSubCommand): CameraCommandContentSettings {
  if (subCommand === 'set_params') return { content: '0.55,62.292,-22', contentIsHex: false }
  if (subCommand === 'set_range') return { content: '1.000,1.500', contentIsHex: false }
  return { content: '', contentIsHex: subCommand === 'bbox_draw' }
}

export function createDefaultCameraParametersSettings(): CameraParametersSettings {
  return {
    version: 2,
    subCommand: 'set_params',
    commandSettings: {
      set_params: defaultsFor('set_params'),
      set_range: defaultsFor('set_range'),
    },
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
  const commandSettings = { ...defaults.commandSettings }

  if (
    saved.commandSettings &&
    typeof saved.commandSettings === 'object' &&
    !Array.isArray(saved.commandSettings)
  ) {
    for (const command of CAMERA_SUB_COMMANDS) {
      const candidate = (saved.commandSettings as Record<string, unknown>)[command]
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
      const entry = candidate as Record<string, unknown>
      commandSettings[command] = {
        content: typeof entry.content === 'string' ? entry.content : defaultsFor(command).content,
        contentIsHex:
          typeof entry.contentIsHex === 'boolean'
            ? entry.contentIsHex
            : defaultsFor(command).contentIsHex,
      }
    }
  }

  if (typeof saved.content === 'string' || typeof saved.contentIsHex === 'boolean') {
    commandSettings[subCommand] = {
      content: typeof saved.content === 'string' ? saved.content : defaultsFor(subCommand).content,
      contentIsHex:
        typeof saved.contentIsHex === 'boolean'
          ? saved.contentIsHex
          : defaultsFor(subCommand).contentIsHex,
    }
  }

  return { version: 2, subCommand, commandSettings }
}

export class CameraParametersStorage {
  public constructor(private readonly storage: JsonStorage) {}

  public load(): CameraParametersSettings {
    return normalizeSettings(this.storage.read<unknown>(CAMERA_PARAMETERS_SETTINGS_KEY, undefined))
  }

  public save(settings: CameraParametersSettings): void {
    this.storage.write(CAMERA_PARAMETERS_SETTINGS_KEY, normalizeSettings(settings))
  }

  public getCommandSettings(subCommand: CameraSubCommand): CameraCommandContentSettings {
    const settings = this.load()
    return { ...(settings.commandSettings[subCommand] ?? defaultsFor(subCommand)) }
  }

  public saveCommand(subCommand: CameraSubCommand, content: string, contentIsHex: boolean): void {
    const settings = this.load()
    settings.subCommand = subCommand
    settings.commandSettings[subCommand] = { content, contentIsHex }
    this.save(settings)
  }
}
