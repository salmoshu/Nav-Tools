import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { SftpEntry } from '../../src/core/terminal/TerminalTypes'

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), isPackaged: false },
}))

import { TerminalService } from '../../electron/main/services/TerminalService'
import { createNodeTerminalServiceHost } from '../../electron/main/services/TerminalServiceHost'

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
    service = new TerminalService(os.tmpdir(), () => {}, createNodeTerminalServiceHost())
  })

  it('lists a local session directory relative to its runtime cwd', async () => {
    injectSession(service, 'local-cwd', { kind: 'local', cwd: os.tmpdir() })

    const result = await service.listSessionPath('local-cwd', '.')

    expect(result).not.toBeNull()
    expect(result?.resolvedPath).toBe(path.win32.normalize(os.tmpdir()))
    expect(result?.entries.length).toBeGreaterThan(0)
    expect(result?.truncated).toBe(false)
  })

  it('falls back to the home directory when a local session has no cwd', async () => {
    // CI/沙箱可能禁止读取真实用户目录；把“home”固定为可读临时目录，
    // 仍然验证无 cwd 时确实选择 os.homedir() 的返回值。
    const home = os.tmpdir()
    const homedir = vi.spyOn(os, 'homedir').mockReturnValue(home)
    injectSession(service, 'local-home', { kind: 'local' })

    try {
      const result = await service.listSessionPath('local-home', '.')

      expect(result).not.toBeNull()
      expect(result?.resolvedPath).toBe(path.win32.normalize(home))
    } finally {
      homedir.mockRestore()
    }
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

  it('caps SSH directory listings and reports the truncation explicitly', async () => {
    injectSession(service, 'ssh-large-dir', { kind: 'ssh', cwd: '/workspace' })
    const entries: SftpEntry[] = Array.from({ length: 2001 }, (_, index) => ({
      name: `file-${index}`,
      path: `/workspace/file-${index}`,
      directory: false,
      size: 0,
      modifiedAt: 0,
      mode: 0,
    }))
    const listSftp = vi.spyOn(service, 'listSftp').mockResolvedValue(entries)

    try {
      const result = await service.listSessionPath('ssh-large-dir', '.')

      expect(result?.entries).toHaveLength(2000)
      expect(result?.truncated).toBe(true)
    } finally {
      listSftp.mockRestore()
    }
  })
})
