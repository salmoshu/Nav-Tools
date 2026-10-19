import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import {
  FILE_TREE_RING_RADIUS,
  IDLE_FILE_TREE_DOWNLOAD,
  TRANSFER_RATE_WINDOW_MS,
  beginFileTreeDownload,
  estimateTransferRate,
  fileTreeDownloadPercent,
  fileTreeRingCircumference,
  fileTreeRingDasharray,
  fileTreeRingIndeterminateDasharray,
  formatRemainingSeconds,
  formatTransferBytes,
  formatTransferPair,
  formatTransferPairText,
  pushTransferSample,
  reduceFileTreeTransferEvent,
  remainingTransferSeconds,
  settleFileTreeDownload,
  windowTransferRate,
  type FileTreeDownloadStatus,
  type TransferProgressSample,
} from '../../src/core/terminal/FileTreeDownloadStatus'

const execFileAsync = promisify(execFile)
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

      // 聚合改造后:整次下载共用 operationId,首事件是总量已知的 running 占位
      expect(events.map((event) => event.status)).toEqual(['running', 'running', 'success'])
      expect(events[0]).toMatchObject({ name: 'remote.txt', transferred: 0, total: 42 })
      expect(events[1]).toMatchObject({ name: 'remote.txt', transferred: 21, total: 42 })
      expect(events[2]).toMatchObject({ transferred: 42, total: 42 })
      expect(new Set(events.map((event) => event.operationId)).size).toBe(1)

      events.length = 0
      fakeSftp.fastGet = (_r, _l, _o, cb: (error?: Error) => void) => cb(new Error('sftp boom'))
      await expect(
        service.downloadSessionPath('ssh-dl', 'remote.txt', path.join(dir, 'remote-dl.txt')),
      ).rejects.toThrow('sftp boom')
      expect(events.map((event) => event.status)).toEqual(['running', 'error'])
      expect(events[1]).toMatchObject({ name: 'remote.txt', total: 42, error: 'sftp boom' })
    } finally {
      getSftp.mockRestore()
    }
  })

  it('SSH 目录下载:整棵树共用一个 operationId,进度按总字节聚合', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-ssh-dir-'))
    const { events, broadcast } = collectEvents()
    const service = new TerminalService(os.tmpdir(), broadcast, createNodeTerminalServiceHost())
    injectSession(service, 'ssh-dir', { kind: 'ssh', cwd: '/workspace' })
    const attrs: Record<string, { isDirectory: () => boolean; size: number }> = {
      '/workspace/dir': { isDirectory: () => true, size: 0 },
      '/workspace/dir/a.txt': { isDirectory: () => false, size: 10 },
      '/workspace/dir/sub': { isDirectory: () => true, size: 0 },
      '/workspace/dir/sub/b.txt': { isDirectory: () => false, size: 20 },
      '/workspace/dir/empty': { isDirectory: () => true, size: 0 },
    }
    const listing: Record<string, { filename: string }[]> = {
      '/workspace/dir': [{ filename: 'a.txt' }, { filename: 'sub' }, { filename: 'empty' }],
      '/workspace/dir/sub': [{ filename: 'b.txt' }],
      '/workspace/dir/empty': [],
    }
    const fakeSftp = {
      stat: (target: string, cb: (error: unknown, attrs?: unknown) => void) =>
        cb(attrs[target] ? null : new Error(`no such file: ${target}`), attrs[target]),
      readdir: (target: string, cb: (error: unknown, list?: unknown) => void) =>
        cb(listing[target] ? null : new Error(`not a directory: ${target}`), listing[target]),
      fastGet: (
        remote: string,
        local: string,
        opts: { step: (transferred: number, chunk: number, total: number) => void },
        cb: (error?: Error) => void,
      ) => {
        const size = attrs[remote].size
        opts.step(Math.floor(size / 2), Math.floor(size / 2), size)
        void fs.writeFile(local, 'x'.repeat(size)).then(() => cb(null), cb)
      },
    }
    const getSftp = vi
      .spyOn(service as unknown as { getSftp: (id: string) => Promise<unknown> }, 'getSftp')
      .mockResolvedValue(fakeSftp)
    try {
      await service.downloadSessionPath('ssh-dir', 'dir', path.join(dir, 'dir'))

      // totalBytes = 10 + 20 = 30;transferred 为「已完成 + 当前文件已传」
      const statuses = events.map((event) => event.status)
      expect(statuses[0]).toBe('running')
      expect(statuses[statuses.length - 1]).toBe('success')
      expect(new Set(events.map((event) => event.operationId)).size).toBe(1)
      expect(events[0]).toMatchObject({ name: 'dir', transferred: 0, total: 30 })
      const runningTransferred = events
        .filter((event) => event.status === 'running')
        .map((event) => event.transferred)
      expect(runningTransferred).toEqual([0, 5, 10 + 10])
      const last = events[events.length - 1]
      expect(last).toMatchObject({ name: 'dir', transferred: 30, total: 30, status: 'success' })

      // 落盘结构:子目录与空目录都被还原
      expect(await fs.readFile(path.join(dir, 'dir', 'a.txt'), 'utf8')).toBe('x'.repeat(10))
      expect(await fs.readFile(path.join(dir, 'dir', 'sub', 'b.txt'), 'utf8')).toBe('x'.repeat(20))
      expect((await fs.stat(path.join(dir, 'dir', 'empty'))).isDirectory()).toBe(true)
    } finally {
      getSftp.mockRestore()
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('本机目录下载:预 stat 求和,逐文件完成时发聚合 running', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-local-dir-'))
    const { events, broadcast } = collectEvents()
    const service = new TerminalService(os.tmpdir(), broadcast, createNodeTerminalServiceHost())
    injectSession(service, 'local-dir', { kind: 'local', cwd: dir })
    const sourceDir = path.join(dir, 'src-dir')
    try {
      await fs.mkdir(path.join(sourceDir, 'sub'), { recursive: true })
      await fs.writeFile(path.join(sourceDir, 'a.txt'), '12345')
      await fs.writeFile(path.join(sourceDir, 'sub', 'b.txt'), '123456')

      await service.downloadSessionPath('local-dir', 'src-dir', path.join(dir, 'dest-dir'))

      expect(new Set(events.map((event) => event.operationId)).size).toBe(1)
      expect(events[0]).toMatchObject({
        name: 'src-dir',
        transferred: 0,
        total: 11,
        status: 'running',
      })
      // 每完成一个文件发一次聚合进度,最后 success 收尾
      expect(events[events.length - 1]).toMatchObject({
        name: 'src-dir',
        transferred: 11,
        total: 11,
        status: 'success',
      })
      expect(events.every((event) => event.total === 11)).toBe(true)
      expect(await fs.readFile(path.join(dir, 'dest-dir', 'a.txt'), 'utf8')).toBe('12345')
      expect(await fs.readFile(path.join(dir, 'dest-dir', 'sub', 'b.txt'), 'utf8')).toBe('123456')
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('WSL 目录下载:tar 流式落盘后解包,不出现绝对路径镜像,尊重对话框改名', async () => {
    // 夹具:用系统 tar 造一个以 proj 为根条目的归档,模拟 tar -cf - -C 的输出
    const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-wsl-src-'))
    await fs.mkdir(path.join(fixtureRoot, 'proj'))
    await fs.writeFile(path.join(fixtureRoot, 'proj', 'hello.txt'), 'wsl-content')
    const tarFixture = path.join(fixtureRoot, 'proj.tar')
    // 测试环境 PATH 里可能是 GNU tar:会把 C:\ 盘符路径当远程主机,全程相对路径规避
    await execFileAsync('tar', ['-cf', 'proj.tar', 'proj'], { cwd: fixtureRoot })

    const picked = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-wsl-dst-'))
    const nodeHost = createNodeTerminalServiceHost()
    const pipeOutputToFile = vi.fn(async (_exe: string, _args: string[], destPath: string) => {
      await fs.copyFile(tarFixture, destPath)
    })
    const realExecuteFile = nodeHost.executeFile
    const executeFile = vi.fn(
      async (executable: string, args: string[], options?: { maxBuffer?: number }) => {
        if (executable === 'wsl.exe') return Buffer.from('4096 /home/user/proj', 'utf8')
        if (executable === 'tar') {
          // 同上 GNU tar 盘符问题:换成相对路径在 destDir 里解包(语义与真实调用一致)
          await execFileAsync('tar', ['-xf', path.basename(args[1]), '-C', '.'], { cwd: args[3] })
          return Buffer.from('')
        }
        return realExecuteFile(executable, args, options)
      },
    )
    const host: TerminalServiceHost = { ...nodeHost, executeFile, pipeOutputToFile }
    const { events, broadcast } = collectEvents()
    const service = new TerminalService(os.tmpdir(), broadcast, host)
    injectSession(service, 'wsl-dl', { kind: 'wsl', cwd: '/home/user', wslDistro: 'Ubuntu' })
    try {
      // 对话框里把 proj 改名为 renamed:落盘应直接是 renamed/hello.txt
      await service.downloadSessionPath('wsl-dl', 'proj', path.join(picked, 'renamed'))

      expect(await fs.readFile(path.join(picked, 'renamed', 'hello.txt'), 'utf8')).toBe(
        'wsl-content',
      )
      // 没有 home/user/... 的整棵路径镜像,临时 tar 已清理
      expect(await fs.stat(path.join(picked, 'home')).catch(() => null)).toBeNull()
      expect(await fs.stat(path.join(picked, 'renamed.navtools.tar')).catch(() => null)).toBeNull()

      // tar 打包走流式管道,且用 -C 切到父目录后只打包 basename
      expect(pipeOutputToFile).toHaveBeenCalledTimes(1)
      const [exe, args] = pipeOutputToFile.mock.calls[0] as [string, string[], string]
      expect(exe).toBe('wsl.exe')
      expect(args.join(' ')).toContain('tar -cf - -C')
      expect(args.join(' ')).toContain("'/home/user'")
      expect(args.join(' ')).toContain("'proj'")

      // du -sb 的总量进了事件;成功时 transferred 补齐到 total
      expect(events.map((event) => event.status)).toEqual(['running', 'success'])
      expect(events[0]).toMatchObject({ name: 'proj', transferred: 0, total: 4096 })
      expect(events[1]).toMatchObject({ transferred: 4096, total: 4096 })
      expect(new Set(events.map((event) => event.operationId)).size).toBe(1)
    } finally {
      await fs.rm(fixtureRoot, { recursive: true, force: true })
      await fs.rm(picked, { recursive: true, force: true })
    }
  })

  it('WSL 下载失败:发 error 事件并继续抛错,临时 tar 被清理', async () => {
    const picked = await fs.mkdtemp(path.join(os.tmpdir(), 'navtools-wsl-err-'))
    const nodeHost = createNodeTerminalServiceHost()
    const host: TerminalServiceHost = {
      ...nodeHost,
      executeFile: vi.fn(async () => Buffer.from('4096 /home/user/proj', 'utf8')),
      pipeOutputToFile: vi.fn(async () => {
        throw new Error('wsl boom')
      }),
    }
    const { events, broadcast } = collectEvents()
    const service = new TerminalService(os.tmpdir(), broadcast, host)
    injectSession(service, 'wsl-err', { kind: 'wsl', cwd: '/home/user', wslDistro: 'Ubuntu' })
    try {
      await expect(
        service.downloadSessionPath('wsl-err', 'proj', path.join(picked, 'proj')),
      ).rejects.toThrow('wsl boom')

      expect(events.map((event) => event.status)).toEqual(['running', 'error'])
      expect(events[1]).toMatchObject({ name: 'proj', total: 4096, error: 'wsl boom' })
      expect(await fs.stat(path.join(picked, 'proj.navtools.tar')).catch(() => null)).toBeNull()
    } finally {
      await fs.rm(picked, { recursive: true, force: true })
    }
  })
})

describe('传输速率与剩余时间估算(纯函数)', () => {
  const sample = (at: number, transferred: number, total = 100): TransferProgressSample => ({
    at,
    transferred,
    total,
  })

  it('相邻 running 采样差分速率;异常采样返回 null', () => {
    expect(estimateTransferRate(null, sample(1000, 10))).toBeNull()
    // 1 秒传 500 字节 → 500 B/s
    expect(estimateTransferRate(sample(1000, 100), sample(2000, 600))).toBe(500)
    // total 变化视为新任务
    expect(estimateTransferRate(sample(1000, 100, 100), sample(2000, 300, 200))).toBeNull()
    // 字节回退(新任务从头开始)
    expect(estimateTransferRate(sample(1000, 100), sample(2000, 50))).toBeNull()
    // 时间没有前进
    expect(estimateTransferRate(sample(1000, 100), sample(1000, 200))).toBeNull()
  })

  it('剩余秒数:总量未知/速率缺失/已完成时返回 null', () => {
    expect(remainingTransferSeconds(50, 0, 100)).toBeNull()
    expect(remainingTransferSeconds(50, 100, null)).toBeNull()
    expect(remainingTransferSeconds(50, 100, 0)).toBeNull()
    expect(remainingTransferSeconds(100, 100, 50)).toBeNull()
    expect(remainingTransferSeconds(50, 100, 25)).toBe(2)
  })

  it('格式化剩余时间:定宽 mm:ss,超 1 小时为 h:mm:ss', () => {
    expect(formatRemainingSeconds(0)).toBe('00:00')
    expect(formatRemainingSeconds(0.4)).toBe('00:01')
    expect(formatRemainingSeconds(8.2)).toBe('00:09')
    expect(formatRemainingSeconds(65)).toBe('01:05')
    expect(formatRemainingSeconds(3600)).toBe('1:00:00')
    expect(formatRemainingSeconds(3723)).toBe('1:02:03')
    expect(formatRemainingSeconds(-1)).toBe('')
    expect(formatRemainingSeconds(Number.NaN)).toBe('')
  })

  it('格式化字节量:B/KB/MB/GB 分档', () => {
    expect(formatTransferBytes(512)).toBe('512 B')
    expect(formatTransferBytes(1536)).toBe('1.5 KB')
    expect(formatTransferBytes(2 * 1024 * 1024)).toBe('2.0 MB')
    expect(formatTransferBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
    expect(formatTransferBytes(-5)).toBe('')
  })
})

describe('滑动窗口速率采样(纯函数)', () => {
  const sample = (at: number, transferred: number, total = 1000): TransferProgressSample => ({
    at,
    transferred,
    total,
  })

  it('窗口默认 1000ms;稠密事件下裁剪掉窗口前的样本,速率按窗口首尾差分', () => {
    expect(TRANSFER_RATE_WINDOW_MS).toBe(1000)
    let samples: TransferProgressSample[] = []
    for (let i = 0; i <= 8; i += 1) {
      samples = pushTransferSample(samples, sample(i * 250, i * 250))
    }
    // 1s 前的样本被裁剪,队列覆盖最近 >=1s
    expect(samples.map((entry) => entry.at)).toEqual([1000, 1250, 1500, 1750, 2000])
    expect(windowTransferRate(samples)).toBe(1000)
  })

  it('突发被窗口平滑:末尾相邻差分 400 B/s,窗口差分 1100 B/s', () => {
    let samples: TransferProgressSample[] = []
    samples = pushTransferSample(samples, sample(0, 0))
    samples = pushTransferSample(samples, sample(1000, 100))
    samples = pushTransferSample(samples, sample(1100, 1000))
    samples = pushTransferSample(samples, sample(2000, 1200))
    expect(samples.map((entry) => entry.at)).toEqual([1000, 1100, 2000])
    expect(windowTransferRate(samples)).toBe(1100)
  })

  it('事件稀疏时保留上一个样本作锚点,长间隔也能估算', () => {
    let samples: TransferProgressSample[] = []
    samples = pushTransferSample(samples, sample(0, 0))
    samples = pushTransferSample(samples, sample(3000, 900))
    expect(samples).toHaveLength(2)
    expect(windowTransferRate(samples)).toBe(300)
  })

  it('total 变化或字节回退视为新任务:队列重置,速率回到 null', () => {
    let samples = pushTransferSample([], sample(1000, 100, 1000))
    samples = pushTransferSample(samples, sample(2000, 300, 2000))
    expect(samples).toEqual([sample(2000, 300, 2000)])
    expect(windowTransferRate(samples)).toBeNull()

    samples = pushTransferSample(samples, sample(3000, 100, 2000))
    expect(samples).toEqual([sample(3000, 100, 2000)])
  })

  it('样本不足或时间不前进时速率为 null', () => {
    expect(windowTransferRate([])).toBeNull()
    expect(windowTransferRate([sample(1000, 100)])).toBeNull()
    let samples = pushTransferSample([], sample(1000, 100))
    samples = pushTransferSample(samples, sample(1000, 200))
    expect(windowTransferRate(samples)).toBeNull()
  })
})

describe('同单位定宽格式(纯函数)', () => {
  it('formatTransferPair:档位取 total,数值统一 1 位小数', () => {
    expect(formatTransferPair(12918456, 100 * 1024 * 1024)).toEqual({
      transferred: '12.3',
      total: '100.0',
      unit: 'MB',
    })
    // transferred 远小于 total 所在档位时也用同一单位,避免档位切换跳变
    expect(formatTransferPair(512, 2048)).toEqual({
      transferred: '0.5',
      total: '2.0',
      unit: 'KB',
    })
    expect(formatTransferPair(512, 900)).toEqual({
      transferred: '512.0',
      total: '900.0',
      unit: 'B',
    })
    expect(formatTransferPair(0, 3 * 1024 * 1024 * 1024)).toEqual({
      transferred: '0.0',
      total: '3.0',
      unit: 'GB',
    })
  })

  it('formatTransferPair:总量未知或输入非法时返回 null', () => {
    expect(formatTransferPair(10, 0)).toBeNull()
    expect(formatTransferPair(-1, 100)).toBeNull()
    expect(formatTransferPair(Number.NaN, 100)).toBeNull()
  })
})

describe('进度环与紧凑格式化(纯函数)', () => {
  it('周长随半径换算', () => {
    expect(fileTreeRingCircumference()).toBeCloseTo(2 * Math.PI * FILE_TREE_RING_RADIUS, 6)
    expect(fileTreeRingCircumference(10)).toBeCloseTo(62.8318, 3)
  })

  it('dasharray 弧长 = 百分比 × 周长,缺口顺延到一整圈', () => {
    const c = fileTreeRingCircumference()
    const [arc50, gap50] = fileTreeRingDasharray(50)!.split(' ').map(Number)
    expect(arc50).toBeCloseTo(c / 2, 1)
    expect(gap50).toBeCloseTo(c, 1)
    expect(fileTreeRingDasharray(0)!.split(' ')[0]).toBe('0.00')
    const [arcFull] = fileTreeRingDasharray(100)!.split(' ').map(Number)
    expect(arcFull).toBeCloseTo(c, 1)
  })

  it('百分比钳制在 0-100;总量未知(null)返回 null 交给不定态', () => {
    expect(fileTreeRingDasharray(null)).toBeNull()
    const c = fileTreeRingCircumference()
    const [arcOver] = fileTreeRingDasharray(150)!.split(' ').map(Number)
    expect(arcOver).toBeCloseTo(c, 1)
    expect(fileTreeRingDasharray(-5)!.split(' ')[0]).toBe('0.00')
  })

  it('不定态开口弧固定 1/4 弧长 + 3/4 缺口', () => {
    const c = fileTreeRingCircumference()
    const [arc, gap] = fileTreeRingIndeterminateDasharray().split(' ').map(Number)
    expect(arc).toBeCloseTo(c / 4, 1)
    expect(gap).toBeCloseTo((c * 3) / 4, 1)
  })

  it('formatTransferPairText 斜杠两侧无空格', () => {
    expect(formatTransferPairText({ transferred: '12.3', total: '100.0', unit: 'MB' })).toBe(
      '12.3/100.0 MB',
    )
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
  const ipcSource = readFileSync('electron/main/terminalIpc.ts', 'utf8').replace(/\r\n/g, '\n')

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

  it('状态栏用 SVG 进度环替代百分比文本,环形配色跟随相位', () => {
    expect(panelSource).toContain('file-tree-status__ring')
    expect(panelSource).toContain('fileTreeRingDasharray')
    expect(panelSource).toContain('fileTreeRingIndeterminateDasharray')
    expect(panelSource).toContain('stroke-linecap: round')
    expect(panelSource).toContain('.file-tree-status--success .file-tree-status__ring-arc')
    expect(panelSource).toContain('.file-tree-status--error .file-tree-status__ring-arc')
    // 百分比文本与 Loading 旋转图标已移除
    expect(panelSource).not.toContain('file-tree-status__percent')
    expect(panelSource).not.toContain('<Loading />')
    // transferDetail 的斜杠两侧不再有空格
    expect(panelSource).toContain('formatTransferPairText')
    expect(panelSource).not.toContain('${pair.transferred} / ${pair.total}')
  })

  it('文件树在下载前后抛出 begin/settle 事件', () => {
    expect(treeSource).toContain("'download-start': [name: string]")
    expect(treeSource).toContain("'download-settle': [ok: boolean, error?: string]")
    expect(treeSource).toContain("emit('download-start', entry.name)")
    expect(treeSource).toContain("emit('download-settle', true)")
    expect(treeSource).toContain("emit('download-settle', false, errorMessage(error))")
  })

  it('主进程下载通道都有 transfer 生命周期事件', () => {
    expect(serviceSource).toContain(
      'await this.downloadLocalFile(sessionId, target.path, localPath, stats.size)',
    )
    // 本机单文件 / 本机目录聚合 / WSL / SSH 四个失败分支都要发 error 事件
    expect(serviceSource.match(/status: 'error'/g)).toHaveLength(4)
  })

  it('目录下载对话框返回的 filePath 即最终目录,不再重复拼接 name', () => {
    expect(ipcSource).not.toContain('path.join(result.filePath, request.name)')
    expect(ipcSource).toContain('return result.canceled || !result.filePath ? null : result.filePath')
  })

  it('WSL tar 用 -C 只打包 basename,stdout 流式写盘规避 maxBuffer 上限', () => {
    expect(serviceSource).toContain('tar -cf - -C ${quoteShellArg(parentDir')
    expect(serviceSource).toContain('du -sb --')
    expect(serviceSource).toContain('pipeOutputToFile')
    // 全量缓冲进内存再写盘的旧实现已移除
    expect(serviceSource).not.toContain('writeFile(tarPath, buffer)')
  })

  it('面板状态栏展示聚合字节与估算剩余时间', () => {
    expect(panelSource).toContain('transferDetail')
    expect(panelSource).toContain('formatTransferPair')
    expect(panelSource).toContain("t('common.terminal.fileTreeTransferEta'")
    // 定宽:等宽数字 + min-width,避免位数变化引起布局抖动
    expect(panelSource).toContain('font-variant-numeric: tabular-nums')
    expect(panelSource).toContain('min-width: 24ch')
  })

  it('速率用 >=1s 滑动窗口估算,采样队列在 download-start/终态/会话切换时清空', () => {
    expect(panelSource).toContain('pushTransferSample')
    expect(panelSource).toContain('windowTransferRate')
    expect(panelSource).not.toContain('estimateTransferRate')
    // 清空点:handleDownloadStart、handleDownloadSettle、非 running 事件、会话切换
    expect(panelSource.match(/transferSamples = \[\]/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('预览 tab 跟随:面板接收 revealPath 并导航到文件所在目录', () => {
    expect(panelSource).toContain('revealPath?: string')
    expect(panelSource).toContain('() => props.revealPath')
    expect(panelSource).toContain('navigateToRoot(reveal')
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
        'fileTreeTransferEta',
        'filePreviewSessionGone',
      ]) {
        expect(source).toContain(`${key}:`)
      }
    }
  })
})
