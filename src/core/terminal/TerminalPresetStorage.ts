import { createTerminalId } from './TerminalTypes'

/** 一条预设命令。`cwd` 为空表示在会话当前目录执行 */
export interface TerminalPresetCommand {
  id: string
  name: string
  command: string
  cwd?: string
}

const STORAGE_KEY = 'nav-tools:terminal-presets:v1'

export class TerminalPresetStorage {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}

  list(): TerminalPresetCommand[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as { version: number; presets: TerminalPresetCommand[] }
      if (parsed.version !== 1 || !Array.isArray(parsed.presets)) return []
      return parsed.presets.flatMap((preset) => {
        try {
          return [normalizePreset(preset)]
        } catch {
          // 单条脏数据不该让整个面板打不开
          return []
        }
      })
    } catch {
      return []
    }
  }

  save(preset: TerminalPresetCommand): TerminalPresetCommand {
    const normalized = normalizePreset(preset)
    const presets = this.list()
    const index = presets.findIndex((entry) => entry.id === normalized.id)
    if (index >= 0) presets[index] = normalized
    else presets.push(normalized)
    this.persist(presets)
    return { ...normalized }
  }

  remove(id: string): void {
    this.persist(this.list().filter((entry) => entry.id !== id))
  }

  private persist(presets: TerminalPresetCommand[]): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, presets }))
  }
}

export function createTerminalPreset(): TerminalPresetCommand {
  return { id: createTerminalId('preset'), name: '', command: '', cwd: '' }
}

function normalizePreset(preset: TerminalPresetCommand): TerminalPresetCommand {
  const name = String(preset.name || '').trim()
  const command = String(preset.command || '').trim()
  if (!name || !command) throw new Error('Preset name and command are required')
  const cwd = String(preset.cwd || '').trim()
  return {
    id: String(preset.id || createTerminalId('preset')),
    name,
    command,
    ...(cwd ? { cwd } : {}),
  }
}
