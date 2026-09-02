import { createTerminalId } from './TerminalTypes'

export type TerminalPresetScope = 'global' | 'project'

/** 一条预设命令。`cwd` 为空表示在会话当前目录执行 */
export interface TerminalPresetCommand {
  id: string
  name: string
  command: string
  cwd?: string
  scope: TerminalPresetScope
}

type TerminalPresetDraft = Omit<TerminalPresetCommand, 'scope'> & {
  scope?: TerminalPresetScope
}

const STORAGE_KEY = 'nav-tools:terminal-presets:v1'
export const TERMINAL_PROJECT_PRESET_PATH = '.nav-tools/terminal-presets.json'
export const TERMINAL_PROJECT_PRESET_MAX_BYTES = 256 * 1024

export class TerminalPresetStorage {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}

  list(): TerminalPresetCommand[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as { version: number; presets: unknown[] }
      if (parsed.version !== 1 || !Array.isArray(parsed.presets)) return []
      return parsed.presets.flatMap((preset) => {
        try {
          return [normalizePreset(preset, 'global')]
        } catch {
          // 单条脏数据不该让整个面板打不开
          return []
        }
      })
    } catch {
      return []
    }
  }

  save(preset: TerminalPresetDraft): TerminalPresetCommand {
    const normalized = normalizePreset(preset, 'global')
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
    this.storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        presets: presets.map(({ scope: _scope, ...preset }) => preset),
      }),
    )
  }
}

export function createTerminalPreset(): TerminalPresetCommand {
  return { id: createTerminalId('preset'), name: '', command: '', cwd: '', scope: 'global' }
}

/** 解析项目目录下只读的 `.nav-tools/terminal-presets.json`。 */
export function parseTerminalProjectPresets(source: string): TerminalPresetCommand[] {
  const parsed = JSON.parse(source) as { version?: unknown; presets?: unknown }
  if (parsed.version !== 1 || !Array.isArray(parsed.presets)) {
    throw new Error('Unsupported terminal project preset document')
  }
  return parsed.presets.flatMap((preset, index) => {
    try {
      return [normalizePreset(preset, 'project', index)]
    } catch {
      // 项目文件里一条脏数据不应遮住其余健康预设
      return []
    }
  })
}

/** 项目项靠前，方便在当前上下文优先取用；同名项保留并由作用域标签区分。 */
export function mergeTerminalPresets(
  globalPresets: readonly TerminalPresetCommand[],
  projectPresets: readonly TerminalPresetCommand[],
): TerminalPresetCommand[] {
  return [...projectPresets, ...globalPresets]
}

function normalizePreset(
  preset: unknown,
  scope: TerminalPresetScope,
  projectIndex = 0,
): TerminalPresetCommand {
  if (!preset || typeof preset !== 'object') throw new Error('Invalid terminal preset')
  const record = preset as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const command = typeof record.command === 'string' ? record.command.trim() : ''
  if (!name || !command) throw new Error('Preset name and command are required')
  const cwd = typeof record.cwd === 'string' ? record.cwd.trim() : ''
  const rawId = typeof record.id === 'string' ? record.id.trim() : ''
  return {
    id:
      scope === 'project'
        ? `project:${projectIndex}:${rawId || 'preset'}`
        : rawId || createTerminalId('preset'),
    name,
    command,
    ...(cwd ? { cwd } : {}),
    scope,
  }
}
