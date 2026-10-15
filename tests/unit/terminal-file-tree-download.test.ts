import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  IDLE_FILE_TREE_DOWNLOAD,
  beginFileTreeDownload,
  fileTreeDownloadPercent,
  reduceFileTreeTransferEvent,
  settleFileTreeDownload,
  type FileTreeDownloadStatus,
} from '../../src/core/terminal/FileTreeDownloadStatus'
import type { SftpTransferEvent } from '../../src/core/terminal/TerminalTypes'

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), isPackaged: false },
}))

import { TerminalService } from '../../electron/main/services/TerminalService'
import {
  createNodeTerminalServiceHost,
  type TerminalServiceHost,
} from '../../electron/main/services/TerminalServiceHost'

function transferEvent(partial: Partial<SftpTransferEvent> = {}): SftpTransferEvent {
  return {
    sessionId: 's1',
    operationId: 'op-1',
    direction: 'download',
    name: 'a.bin',
    transferred: 0,
    total: 100,
    status: 'running',
    ...partial,
  }
}

describe('FileTreeDownloadStatus 归约', () => {
  it('beginFileTreeDownload 返回 running 占位,总量未知', () => {
    const status = beginFileTreeDownload('logs.zip')
    expect(status).toEqual({ phase: 'running', name: 'logs.zip', transferred: 0, total: 0 })
    expect(fileTreeDownloadPercent(status)).toBeNull()
  })

  it('running 事件更新字节数并换算百分比', () => {
    const status = reduceFileTreeTransferEvent(
      beginFileTreeDownload('a.bin'),
      transferEvent({ transferred: 25, total: 100 }),
    )
    expect(status.phase).toBe('running')
    expect(fileTreeDownloadPercent(status)).toBe(25)
  })

  it('上传方向的事件与文件树状态栏无关,原样返回', () => {
    const current = beginFileTreeDownload('a.bin')
    const event = transferEvent({ direction: 'upload', transferred: 50 })
    expect(reduceFileTreeTransferEvent(current, event)).toBe(current)
  })

  it('success/error 事件把相位推进到对应终态', () => {
    const running = beginFileTreeDownload('a.bin')
    const done = reduceFileTreeTransferEvent(
      running,
      transferEvent({ status: 'success', transferred: 100, total: 100 }),
    )
    expect(done.phase).toBe('success')
    expect(fileTreeDownloadPercent(done)).toBe(100)
    const failed = reduceFileTreeTransferEvent(
      running,
      transferEvent({ status: 'error', error: 'boom' }),
    )
    expect(failed.phase).toBe('error')
    expect(failed.error).toBe('boom')
  })

  it('settle 失败是权威结果;成功只在仍在 running 时收尾', () => {
    const running = beginFileTreeDownload('a.bin')
    const failed = settleFileTreeDownload(running, false, '磁盘已满')
    expect(failed).toMatchObject({ phase: 'error', name: 'a.bin', error: '磁盘已满' })
    // 事件已给出 error 时,settle 无新消息则保留事件里的消息
    const withEventError = { ...running, phase: 'error' as const, error: 'sftp boom' }
    expect(settleFileTreeDownload(withEventError, false).error).toBe('sftp boom')

    const succeeded = settleFileTreeDownload(running, true)
    expect(succeeded.phase).toBe('success')
    // 成功事件通常先于 invoke 落定:已 success 的状态不被 settle 改写
    const alreadyDone: FileTreeDownloadStatus = { ...running, phase: 'success' }
    expect(settleFileTreeDownload(alreadyDone, true)).toBe(alreadyDone)
    expect(settleFileTreeDownload(IDLE_FILE_TREE_DOWNLOAD, true)).toBe(IDLE_FILE_TREE_DOWNLOAD)
  })

  it('百分比在总量未知时为 null,且不会越过 100', () => {
    expect(
      fileTreeDownloadPercent({ phase: 'running', name: 'x', transferred: 10, total: 0 }),
    ).toBeNull()
    expect(
      fileTreeDownloadPercent({ phase: 'running', name: 'x', transferred: 120, total: 100 }),
    ).toBe(100)
  })
})

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

function collectEvents(): { events: SftpTransferEvent[]; broadcast: (c: string, p: unknown) => void } {
  const events: SftpTransferEvent[] = []
  return {
    events,
    broadcast: (channel, payload) => {
      if (channel === 'terminal-sftp-transfer') events.push(payload as SftpTransferEvent)
    },
  }
}

describe('terminal-session-download 传输事件', () => {
  it('本机文件下载发出 running/success 事件并携带真实大小', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-dl-'))
    const { events, broadcast } = collectEvents()
    const service = new TerminalService(os.tmpdir(), broadcast, createNodeTerminalServiceHost())
    injectSession(service, 'local-dl', { kind: 'local', cwd: dir })
    try {
      await fs.writeFile(path.join(dir, 'dl.txt'), 'hello')

      await service.downloadSessionPath('local-dl', 'dl.txt', path.join(dir, 'dl-copy.txt'))

      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({
        sessionId: 'local-dl',
        direction: 'download',
        name: 'dl.txt',
        transferred: 0,
        total: 5,
        status: 'running',
      })
      expect(events[1]).toMatchObject({ transferred: 5, total: 5, status: 'success' })
      await expect(fs.readFile(path.join(dir, 'dl-copy.txt'), 'utf8')).resolves.toBe('hello')
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('本机复制失败时发出 error 事件并继续抛错', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-dl-err-'))
    const nodeHost = createNodeTerminalServiceHost()
    const host: TerminalServiceHost = {
      ...nodeHost,
      fileSystem: {
        ...nodeHost.fileSystem,
        copyFile: vi.fn().mockRejectedValue(new Error('EACCES denied')),
      },
    }
    const { events, broadcast } = collectEvents()
    const service = new TerminalService(os.tmpdir(), broadcast, host)
    injectSession(service, 'local-dl-err', { kind: 'local', cwd: dir })
    try {
      await fs.writeFile(path.join(dir, 'dl.txt'), 'hello')

      await expect(
        service.downloadSessionPath('local-dl-err', 'dl.txt', path.join(dir, 'dl-copy.txt')),
      ).rejects.toThrow('EACCES denied')

      expect(events.map((event) => event.status)).toEqual(['running', 'error'])
      expect(events[1]).toMatchObject({ name: 'dl.txt', total: 5, error: 'EACCES denied' })
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('SSH 下载经 fastGet 回报进度,失败时补发 error 事件', async () => {
    const dir = os.tmpdir()
    const { events, broadcast } = collectEvents()
    const service = new TerminalService(os.tmpdir(), broadcast, createNodeTerminalServiceHost())
    injectSession(service, 'ssh-dl', { kind: 'ssh', cwd: '/workspace' })
    const fakeSftp = {
      stat: (_path: string, cb: (error: unknown, attrs?: unknown) => void) =>
        cb(null, { isDirectory: () => false, size: 42 }),
      fastGet: (
        _remote: string,
        _local: string,
        opts: { step: (transferred: number, chunk: number, total: number) => void },
        cb: (error?: Error) => void,
      ) => {
        opts.step(21, 21, 42)
        cb(null)
      },
    }
    const getSftp = vi
      .spyOn(service as unknown as { getSftp: (id: string) => Promise<unknown> }, 'getSftp')
      .mockResolvedValue(fakeSftp)
    try {
      await service.downloadSessionPath('ssh-dl', 'remote.txt', path.join(dir, 'remote-dl.txt'))

      expect(events.map((event) => event.status)).toEqual(['running', 'success'])
      expect(events[0]).toMatchObject({ name: 'remote.txt', transferred: 21, total: 42 })
      expect(events[1]).toMatchObject({ transferred: 42, total: 42 })

      events.length = 0
      fakeSftp.fastGet = (_r, _l, _o, cb: (error?: Error) => void) => cb(new Error('sftp boom'))
      await expect(
        service.downloadSessionPath('ssh-dl', 'remote.txt', path.join(dir, 'remote-dl.txt')),
      ).rejects.toThrow('sftp boom')
      expect(events.map((event) => event.status)).toEqual(['error'])
      expect(events[0]).toMatchObject({ name: 'remote.txt', total: 42, error: 'sftp boom' })
    } finally {
      getSftp.mockRestore()
    }
  })
})

describe('文件树侧边栏接线(源码扫描)', () => {
  const panelSource = readFileSync(
    'src/components/windows/common/TerminalFileTreePanel.vue',
    'utf8',
  ).replace(/\r\n/g, '\n')
  const treeSource = readFileSync(
    'src/components/windows/common/TerminalFileTree.vue',
    'utf8',
  ).replace(/\r\n/g, '\n')
  const serviceSource = readFileSync('electron/main/services/TerminalService.ts', 'utf8')
    .replace(/\r\n/g, '\n')

  it('面板提供拖拽手柄:指针捕获 + 键盘微调 + aria 分隔符语义', () => {
    expect(panelSource).toContain('class="file-tree-resizer"')
    expect(panelSource).toContain('role="separator"')
    expect(panelSource).toContain('aria-orientation="vertical"')
    expect(panelSource).toContain('@pointerdown="startResize"')
    expect(panelSource).toContain('@pointermove="resizeWithPointer"')
    expect(panelSource).toContain('@lostpointercapture="finishResize"')
    expect(panelSource).toContain('@keydown="resizeWithKeyboard"')
    expect(panelSource).toContain('resizeHandle.value?.setPointerCapture(event.pointerId)')
    expect(panelSource).toContain("t('common.terminal.resizeFileTreePanel')")
    // CSS resize 已移除,宽度改由状态绑定
    expect(panelSource).not.toContain('resize: horizontal')
    expect(panelSource).toContain(':style="{ width: `${panelWidth}px` }"')
  })

  it('面板底部状态栏消费 transfer 事件并按会话过滤', () => {
    expect(panelSource).toContain('class="file-tree-status"')
    expect(panelSource).toContain('role="status"')
    expect(panelSource).toContain(
      "window.ipcRenderer?.on('terminal-sftp-transfer', handleTransfer)",
    )
    expect(panelSource).toContain(
      "window.ipcRenderer?.off('terminal-sftp-transfer', handleTransfer)",
    )
    expect(panelSource).toContain('if (event.sessionId !== props.sessionId) return')
    expect(panelSource).toContain('reduceFileTreeTransferEvent(download.value, event)')
    expect(panelSource).toContain("t('common.terminal.fileTreeStatusDownloading'")
    expect(panelSource).toContain("t('common.terminal.fileTreeStatusDone'")
    expect(panelSource).toContain("t('common.terminal.fileTreeStatusFailed'")
    expect(panelSource).toContain("t('common.terminal.fileTreeStatusIdle')")
  })

  it('文件树在下载前后抛出 begin/settle 事件', () => {
    expect(treeSource).toContain("'download-start': [name: string]")
    expect(treeSource).toContain("'download-settle': [ok: boolean, error?: string]")
    expect(treeSource).toContain("emit('download-start', entry.name)")
    expect(treeSource).toContain("emit('download-settle', true)")
    expect(treeSource).toContain("emit('download-settle', false, errorMessage(error))")
  })

  it('主进程三条下载通道都有 transfer 生命周期事件', () => {
    expect(serviceSource).toContain(
      'await this.downloadLocalFile(sessionId, target.path, localPath, stats.size)',
    )
    // 本机 / WSL / SSH 三条路径的失败分支都要发 error 事件
    expect(serviceSource.match(/status: 'error'/g)).toHaveLength(3)
  })

  it('zh-CN / en-US 状态栏与拖拽文案同步', () => {
    for (const locale of ['zh-CN', 'en-US']) {
      const source = readFileSync(`src/i18n/locales/${locale}/common.ts`, 'utf8')
      for (const key of [
        'resizeFileTreePanel',
        'fileTreeStatusIdle',
        'fileTreeStatusDownloading',
        'fileTreeStatusDone',
        'fileTreeStatusFailed',
      ]) {
        expect(source).toContain(`${key}:`)
      }
    }
  })
})
