import { describe, expect, it } from 'vitest'
import {
  TerminalPresetStorage,
  createTerminalPreset,
  mergeTerminalPresets,
  parseTerminalProjectPresets,
} from '@/core/terminal/TerminalPresetStorage'

function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> & { dump(): string | null } {
  let value: string | null = null
  return {
    getItem: (key: string) => (key === 'nav-tools:terminal-presets:v1' ? value : null),
    setItem: (_key: string, next: string) => {
      value = next
    },
    dump: () => value,
  }
}

describe('TerminalPresetStorage', () => {
  it('starts empty and tolerates corrupt payloads', () => {
    const storage = fakeStorage()
    expect(new TerminalPresetStorage(storage).list()).toEqual([])
    storage.setItem('nav-tools:terminal-presets:v1', 'not json')
    expect(new TerminalPresetStorage(storage).list()).toEqual([])
  })

  it('assigns an id on save and reads it back', () => {
    const storage = new TerminalPresetStorage(fakeStorage())
    const saved = storage.save({ ...createTerminalPreset(), name: 'build', command: 'pnpm build' })
    expect(saved.id).toBeTruthy()
    expect(storage.list()).toEqual([
      { id: saved.id, name: 'build', command: 'pnpm build', scope: 'global' },
    ])
  })

  it('updates in place when the id already exists', () => {
    const storage = new TerminalPresetStorage(fakeStorage())
    const saved = storage.save({ ...createTerminalPreset(), name: 'build', command: 'pnpm build' })
    storage.save({ ...saved, command: 'pnpm build:dir' })
    const presets = storage.list()
    expect(presets).toHaveLength(1)
    expect(presets[0].command).toBe('pnpm build:dir')
  })

  it('drops a blank working directory instead of persisting an empty string', () => {
    const storage = new TerminalPresetStorage(fakeStorage())
    storage.save({ ...createTerminalPreset(), name: 'x', command: 'ls', cwd: '   ' })
    expect(storage.list()[0]).not.toHaveProperty('cwd')
  })

  it('rejects presets without a name or command', () => {
    const storage = new TerminalPresetStorage(fakeStorage())
    expect(() => storage.save({ ...createTerminalPreset(), name: '', command: 'ls' })).toThrow()
    expect(() => storage.save({ ...createTerminalPreset(), name: 'x', command: '  ' })).toThrow()
    expect(storage.list()).toEqual([])
  })

  it('skips dirty entries without losing the healthy ones', () => {
    const storage = fakeStorage()
    storage.setItem(
      'nav-tools:terminal-presets:v1',
      JSON.stringify({
        version: 1,
        presets: [
          { id: 'a', name: 'ok', command: 'ls' },
          { id: 'b', name: 'no command', command: '' },
        ],
      }),
    )
    expect(new TerminalPresetStorage(storage).list().map((preset) => preset.id)).toEqual(['a'])
  })

  it('removes by id', () => {
    const storage = new TerminalPresetStorage(fakeStorage())
    const first = storage.save({ ...createTerminalPreset(), name: 'a', command: 'ls' })
    storage.save({ ...createTerminalPreset(), name: 'b', command: 'll' })
    storage.remove(first.id)
    expect(storage.list().map((preset) => preset.name)).toEqual(['b'])
  })

  it('parses project presets and skips dirty entries', () => {
    const presets = parseTerminalProjectPresets(
      JSON.stringify({
        version: 1,
        presets: [
          { id: 'build', name: '项目构建', command: 'pnpm build', cwd: 'packages/app' },
          { name: '缺少命令' },
          { name: '测试', command: 'pnpm test' },
        ],
      }),
    )

    expect(presets).toHaveLength(2)
    expect(presets.map(({ name, command, cwd, scope }) => ({ name, command, cwd, scope }))).toEqual(
      [
        { name: '项目构建', command: 'pnpm build', cwd: 'packages/app', scope: 'project' },
        { name: '测试', command: 'pnpm test', cwd: undefined, scope: 'project' },
      ],
    )
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(2)
  })

  it('rejects an unsupported project preset document', () => {
    expect(() => parseTerminalProjectPresets('{"version":2,"presets":[]}')).toThrow()
    expect(() => parseTerminalProjectPresets('{"version":1,"presets":{}}')).toThrow()
  })

  it('merges project presets before global presets without changing their scopes', () => {
    const globalPresets = [
      { id: 'global-1', name: '全局', command: 'pwd', scope: 'global' as const },
    ]
    const projectPresets = parseTerminalProjectPresets(
      '{"version":1,"presets":[{"name":"项目","command":"pnpm test"}]}',
    )

    expect(
      mergeTerminalPresets(globalPresets, projectPresets).map((preset) => preset.scope),
    ).toEqual(['project', 'global'])
  })
})
