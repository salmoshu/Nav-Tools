import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { SftpEntry } from '../../src/core/terminal/TerminalTypes'

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), isPackaged: false },
}))

import { TerminalService } from '../../electron/main/services/TerminalService'
import {
  createNodeTerminalServiceHost,
  type TerminalServiceHost,
} from '../../electron/main/services/TerminalServiceHost'

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

describe('terminal file tree renameSessionPath/deleteSessionPath', () => {
  let service: TerminalService

  beforeAll(() => {
    service = new TerminalService(os.tmpdir(), () => {}, createNodeTerminalServiceHost())
  })

  it('renames a local file relative to the session cwd and keeps its content', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-rename-'))
    injectSession(service, 'local-rename', { kind: 'local', cwd: dir })
    try {
      await fs.writeFile(path.join(dir, 'old.txt'), 'payload')

      await service.renameSessionPath('local-rename', 'old.txt', 'new.txt')

      await expect(fs.readFile(path.join(dir, 'new.txt'), 'utf8')).resolves.toBe('payload')
      expect(existsSync(path.join(dir, 'old.txt'))).toBe(false)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('deletes a local directory recursively only when the directory flag is set', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-delete-'))
    injectSession(service, 'local-delete', { kind: 'local', cwd: dir })
    try {
      await fs.mkdir(path.join(dir, 'sub'))
      await fs.writeFile(path.join(dir, 'sub', 'leaf.txt'), 'x')

      await expect(service.deleteSessionPath('local-delete', 'sub', false)).rejects.toThrow()
      await service.deleteSessionPath('local-delete', 'sub', true)

      expect(existsSync(path.join(dir, 'sub'))).toBe(false)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects operations on missing sessions and missing local paths', async () => {
    injectSession(service, 'local-missing', { kind: 'local', cwd: os.tmpdir() })

    await expect(service.renameSessionPath('no-such-session', 'a', 'b')).rejects.toThrow(
      '终端会话不存在',
    )
    await expect(service.deleteSessionPath('no-such-session', 'a', false)).rejects.toThrow(
      '终端会话不存在',
    )
    await expect(
      service.deleteSessionPath('local-missing', 'definitely-not-there.txt', false),
    ).rejects.toThrow()
  })

  it('dispatches SSH rename/delete to the SFTP channel with resolved posix paths', async () => {
    injectSession(service, 'ssh-ops', { kind: 'ssh', cwd: '/workspace' })
    const rename = vi.spyOn(service, 'sftpRename').mockResolvedValue()
    const remove = vi.spyOn(service, 'sftpRemove').mockResolvedValue()
    try {
      await service.renameSessionPath('ssh-ops', 'a.txt', 'dir/b.txt')
      await service.deleteSessionPath('ssh-ops', 'dir', true)

      expect(rename).toHaveBeenCalledWith('ssh-ops', '/workspace/a.txt', '/workspace/dir/b.txt')
      expect(remove).toHaveBeenCalledWith('ssh-ops', '/workspace/dir')
    } finally {
      rename.mockRestore()
      remove.mockRestore()
    }
  })

  it('forwards WSL rename/delete to wsl.exe sh with posix-quoted paths', async () => {
    const executeFile = vi.fn<TerminalServiceHost['executeFile']>(async () => Buffer.from(''))
    const wslService = new TerminalService(os.tmpdir(), () => {}, {
      ...createNodeTerminalServiceHost(),
      executeFile,
    })
    injectSession(wslService, 'wsl-ops', { kind: 'wsl', wslDistro: 'Ubuntu', cwd: '/home/robot' })

    await wslService.renameSessionPath('wsl-ops', 'a.txt', 'b.txt')
    await wslService.deleteSessionPath('wsl-ops', 'old dir', true)

    expect(executeFile).toHaveBeenCalledTimes(2)
    const renameCall = executeFile.mock.calls[0]
    expect(renameCall?.[0]).toBe('wsl.exe')
    expect(renameCall?.[1].slice(0, 5)).toEqual(['--distribution', 'Ubuntu', '--', 'sh', '-c'])
    expect(renameCall?.[1][5]).toBe(`mv -- '/home/robot/a.txt' '/home/robot/b.txt'`)
    const deleteCall = executeFile.mock.calls[1]
    expect(deleteCall?.[1][5]).toBe(`rm -r -- '/home/robot/old dir'`)
  })
})
