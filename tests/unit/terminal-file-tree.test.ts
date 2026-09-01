import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), isPackaged: false },
}))

import { TerminalService } from '../../electron/main/services/TerminalService'

interface FakeSessionOptions {
  kind: 'local' | 'wsl' | 'ssh'
  cwd?: string
  wslDistro?: string
}

function injectSession(service: TerminalService, id: string, options: FakeSessionOptions): void {
  const session = {
    type: options.kind === 'ssh' ? 'ssh' : 'pty',
    info: {
      id,
      kind: options.kind,
      title: id,
      status: 'ready',
      cwd: options.cwd,
    },
    scrollback: '',
    oscTail: '',
    request: { kind: options.kind, cols: 80, rows: 24, wslDistro: options.wslDistro },
  }
  ;(service as unknown as { sessions: Map<string, unknown> }).sessions.set(id, session)
}

function resolveSessionPath(
  service: TerminalService,
  id: string,
  rawPath: string,
): { kind: string; path: string; distro?: string } | null {
  const sessions = (service as unknown as { sessions: Map<string, unknown> }).sessions
  const session = sessions.get(id)
  return (
    service as unknown as {
      resolveSessionPath: (s: unknown, p: string) => { kind: string; path: string } | null
    }
  ).resolveSessionPath(session, rawPath)
}

describe('terminal file tree listSessionPath', () => {
  let service: TerminalService

  beforeAll(() => {
    service = new TerminalService(os.tmpdir(), () => {})
  })

  it('lists a local session directory relative to its runtime cwd', async () => {
    injectSession(service, 'local-cwd', { kind: 'local', cwd: os.tmpdir() })

    const result = await service.listSessionPath('local-cwd', '.')

    expect(result).not.toBeNull()
    expect(result?.resolvedPath).toBe(path.win32.normalize(os.tmpdir()))
    expect(result?.entries.length).toBeGreaterThan(0)
  })

  it('falls back to the home directory when a local session has no cwd', async () => {
    injectSession(service, 'local-home', { kind: 'local' })

    const result = await service.listSessionPath('local-home', '.')

    expect(result).not.toBeNull()
    expect(result?.resolvedPath).toBe(path.win32.normalize(os.homedir()))
  })

  it('resolves WSL relative paths without cwd to a plain relative path, not host-cwd garbage', () => {
    injectSession(service, 'wsl-nocwd', { kind: 'wsl', wslDistro: 'Ubuntu' })

    const target = resolveSessionPath(service, 'wsl-nocwd', '.')

    expect(target).not.toBeNull()
    // 不能把宿主(Windows)进程 cwd 拼进 WSL 路径:该路径在 WSL 内不存在,
    // find 失败 → 面板报 "unable to list directory"
    expect(target!.path).not.toContain(process.cwd())
    expect(path.posix.isAbsolute(target!.path)).toBe(false)
  })

  it('resolves WSL relative paths against the runtime cwd when known', () => {
    injectSession(service, 'wsl-cwd', { kind: 'wsl', wslDistro: 'Ubuntu', cwd: '/home/robot' })

    const target = resolveSessionPath(service, 'wsl-cwd', 'logs')

    expect(target?.path).toBe('/home/robot/logs')
  })
})
