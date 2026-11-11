// @vitest-environment node

import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import type { WebContents } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RtkPostService } from '../../electron/main/services/RtkPostService'
import { RtkNaviService } from '../../electron/main/services/RtkNaviService'
import { createDefaultRtkNaviSettings } from '../../src/core/gnsslib/RtkNavi'
import {
  createDefaultRtkPostSettings,
  type RtkPostRunRequest,
} from '../../src/core/gnsslib/RtkPost'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('RtkPostService', () => {
  it('honors a cancel request during asynchronous input preparation without spawning a child', async () => {
    const fixture = await createFixture()
    const spawnMock = vi.fn()
    const service = new RtkPostService(spawnMock as unknown as typeof spawn)
    const sender = fakeSender()
    const running = service.run(sender, fixture.request)
    expect(service.cancel(sender.id, fixture.request.runId)).toBe(true)
    expect(await running).toMatchObject({ ok: false, cancelled: true })
    expect(spawnMock).not.toHaveBeenCalled()
  })
  it('holds the cross-engine lease through native cancellation and releases it on exit', async () => {
    const fixture = await createFixture()
    const child = fakeChild()
    const spawnMock = vi.fn().mockReturnValue(child)
    const post = new RtkPostService(spawnMock as unknown as typeof spawn)
    const live = new RtkNaviService(
      path.dirname(fixture.request.outputPath),
      spawnMock as unknown as typeof spawn,
    )
    const sender = fakeSender()
    const running = post.run(sender, fixture.request)
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce())
    const liveRequest = { ...createDefaultRtkNaviSettings(), runId: 'live-1' }
    await expect(live.start(sender, liveRequest)).rejects.toThrow('GNSS 解算任务')
    post.cancel(sender.id, fixture.request.runId)
    await expect(live.start(sender, liveRequest)).rejects.toThrow('GNSS 解算任务')
    await running
    await expect(live.start(sender, liveRequest)).rejects.not.toThrow('GNSS 解算任务')
    expect(spawnMock).toHaveBeenCalledOnce()
  })
  it('runs rnx2rtkp without a shell and returns parsed solution output', async () => {
    const fixture = await createFixture()
    const child = fakeChild()
    const spawnMock = vi.fn().mockReturnValue(child)
    const sender = fakeSender()
    const service = new RtkPostService(spawnMock as unknown as typeof spawn)
    const running = service.run(sender, fixture.request)
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce())

    const [executable, args, options] = spawnMock.mock.calls[0]
    expect(executable).toBe(fixture.executablePath)
    expect(args.slice(-3)).toEqual([
      fixture.request.roverObsPath,
      fixture.request.baseObsPath,
      fixture.request.navPaths[0],
    ])
    expect(options).toMatchObject({ shell: false, cwd: path.dirname(fixture.request.outputPath) })

    child.stderr.write('processing : 100%\n')
    await writeFile(
      fixture.request.outputPath,
      '%  GPST latitude longitude height Q ns\n' +
        '2024/07/30 00:00:00.000 31.0 121.0 10.0 1 12\n' +
        '2024/07/30 00:00:01.000 31.0 121.0 10.0 2 11\n',
    )
    child.emit('close', 0)
    const result = await running

    expect(result.ok).toBe(true)
    expect(result.solution).toMatchObject({ epochs: 2, fixed: 1, float: 1 })
    expect(result.log).toContain('100%')
    expect(sender.send).toHaveBeenCalledWith(
      'rtkpost-log',
      expect.objectContaining({ runId: fixture.request.runId }),
    )
  })

  it('terminates the active process and reports cancellation', async () => {
    const fixture = await createFixture()
    const child = fakeChild()
    const spawnMock = vi.fn().mockReturnValue(child)
    const sender = fakeSender()
    const service = new RtkPostService(spawnMock as unknown as typeof spawn)
    const running = service.run(sender, fixture.request)
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce())

    expect(service.cancel(sender.id, fixture.request.runId)).toBe(true)
    const result = await running
    expect(child.kill).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ ok: false, cancelled: true, exitCode: null })
  })

  it('refuses to overwrite an input file', async () => {
    const fixture = await createFixture()
    fixture.request.outputPath = fixture.request.roverObsPath
    const spawnMock = vi.fn()
    const service = new RtkPostService(spawnMock as unknown as typeof spawn)

    await expect(service.run(fakeSender(), fixture.request)).rejects.toThrow('不能覆盖')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('captures split CR-delimited engine errors even with exit code zero and an old solution', async () => {
    const fixture = await createFixture()
    await writeFile(fixture.request.outputPath, validSolution)
    const { child, sender, running } = await startFixture(fixture.request)
    child.stderr.write('reading    : observations\rerror : no na')
    child.stdout.write('independent stdout message\n')
    child.stderr.write('v data')
    child.emit('close', 0)

    const result = await running
    expect(result).toMatchObject({ ok: false, exitCode: 0, error: 'error : no nav data' })
    expect(result.solution).toBeUndefined()
    expect(result.log).toContain('error : no nav data\n')
    expect(result.log).not.toContain('\r')
    expect(sender.send).toHaveBeenCalledWith(
      'rtkpost-log',
      expect.objectContaining({ chunk: expect.stringContaining('error : no nav data') }),
    )
    expect(await readFile(fixture.request.outputPath, 'utf8')).toBe(validSolution)
  })

  it.each(['missing', 'empty', 'header-only', 'unchanged'] as const)(
    'does not report success for a %s output with exit code zero',
    async (output) => {
      const fixture = await createFixture()
      if (output === 'unchanged') await writeFile(fixture.request.outputPath, validSolution)
      const { child, running } = await startFixture(fixture.request)
      if (output === 'empty') await writeFile(fixture.request.outputPath, '')
      if (output === 'header-only')
        await writeFile(fixture.request.outputPath, '% no position solutions\n')
      child.emit('close', 0)

      const result = await running
      expect(result.ok).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.log).toContain(result.error)
      expect(result.solution).toBeUndefined()
    },
  )

  it('returns engine diagnostics instead of hiding them behind a nonzero exit code', async () => {
    const fixture = await createFixture()
    const { child, running } = await startFixture(fixture.request)
    child.stderr.write('error : open output file solution.pos\r')
    child.emit('close', 1)
    expect(await running).toMatchObject({
      ok: false,
      exitCode: 1,
      error: 'error : open output file solution.pos',
    })
  })

  it('reports spawn failures and does not reuse the previous result', async () => {
    const fixture = await createFixture()
    const { child, running } = await startFixture(fixture.request)
    child.emit('error', new Error('spawn ENOENT'))
    child.emit('close', -4058)
    expect(await running).toMatchObject({ ok: false, error: expect.stringContaining('ENOENT') })
  })

  it('emits measured progress below 100 until the fresh solution has been inspected', async () => {
    const fixture = await createFixture()
    const { child, sender, running } = await startFixture(fixture.request)
    child.stderr.write('processing : 2024/07/30 00:00:30 Q=1\r')
    child.stderr.write('processing : 2024/07/30 00:00:45 Q=1\r')
    await writeFile(fixture.request.outputPath, validSolution)
    child.emit('close', 0)
    expect((await running).ok).toBe(true)
    expect(sender.send).toHaveBeenCalledWith(
      'rtkpost-progress',
      expect.objectContaining({
        runId: 'run-1',
        phase: 'processing',
        percentage: 50,
        processingTime: '2024/07/30 00:00:30',
      }),
    )
    expect(sender.send).toHaveBeenCalledWith(
      'rtkpost-progress',
      expect.objectContaining({ phase: 'processing', percentage: 75 }),
    )
    expect(sender.send).toHaveBeenCalledWith(
      'rtkpost-progress',
      expect.objectContaining({ phase: 'validating', percentage: 99 }),
    )
    expect(sender.send).not.toHaveBeenCalledWith(
      'rtkpost-progress',
      expect.objectContaining({ percentage: 100 }),
    )
  })

  it('surfaces optional correction warnings while accepting a valid fresh solution', async () => {
    const fixture = await createFixture()
    const { child, running } = await startFixture(fixture.request)
    child.stderr.write('error : no erp data optional.erp\r')
    await writeFile(fixture.request.outputPath, validSolution)
    child.emit('close', 0)
    expect(await running).toMatchObject({
      ok: true,
      warnings: ['error : no erp data optional.erp'],
    })
  })

  it('honors cancellation during result inspection instead of reporting success', async () => {
    const fixture = await createFixture()
    const child = fakeChild()
    const spawnMock = vi.fn().mockReturnValue(child)
    const sender = fakeSender()
    const service = new RtkPostService(spawnMock as unknown as typeof spawn)
    vi.mocked(sender.send).mockImplementation((channel, event) => {
      if (channel === 'rtkpost-progress' && event.phase === 'validating') {
        expect(service.cancel(sender.id, fixture.request.runId)).toBe(true)
      }
    })
    const running = service.run(sender, fixture.request)
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce())
    await writeFile(fixture.request.outputPath, validSolution)
    child.emit('close', 0)
    expect(await running).toMatchObject({ ok: false, cancelled: true, solution: undefined })
  })

  it('keeps the last processing record as live status while retaining other engine logs', async () => {
    const fixture = await createFixture()
    const { child, sender, running } = await startFixture(fixture.request)
    child.stderr.write('reading    : observations\rprocessing : 2024/07/30 00:00:30 Q=1\r')
    child.stderr.write('error : no erp data optional.erp\rprocessing : 2024/07/30 00:00:30 Q=2')
    await writeFile(fixture.request.outputPath, validSolution)
    child.emit('close', 0)
    const result = await running
    expect(result.ok).toBe(true)
    expect(result.log).not.toContain('processing :')
    expect(result.log).toContain('reading    : observations')
    expect(result.log).toContain('error : no erp data optional.erp')
    expect(result.progress).toMatchObject({
      processingMessage: 'processing : 2024/07/30 00:00:30 Q=2',
    })
    expect(sender.send).toHaveBeenCalledWith(
      'rtkpost-progress',
      expect.objectContaining({
        phase: 'validating',
        processingMessage: result.progress!.processingMessage,
      }),
    )
  })
})

const validSolution =
  '% GPST latitude longitude height Q ns\n2024/07/30 00:00:00.000 31.0 121.0 10.0 1 12\n'

async function startFixture(request: RtkPostRunRequest) {
  const child = fakeChild()
  const sender = fakeSender()
  const spawnMock = vi.fn().mockReturnValue(child)
  const service = new RtkPostService(spawnMock as unknown as typeof spawn)
  const running = service.run(sender, request)
  await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce())
  return { child, sender, running }
}

async function createFixture(): Promise<{
  executablePath: string
  request: RtkPostRunRequest
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-rtkpost-'))
  directories.push(directory)
  const executablePath = path.join(
    directory,
    process.platform === 'win32' ? 'rnx2rtkp.exe' : 'rnx2rtkp',
  )
  const request: RtkPostRunRequest = {
    ...createDefaultRtkPostSettings(),
    runId: 'run-1',
    executablePath,
    roverObsPath: path.join(directory, 'rover.obs'),
    baseObsPath: path.join(directory, 'base.obs'),
    navPaths: [path.join(directory, 'rover.nav')],
    outputPath: path.join(directory, 'solution.pos'),
  }
  await Promise.all(
    [executablePath, request.roverObsPath, request.baseObsPath, request.navPaths[0]].map((file) =>
      writeFile(file, 'fixture'),
    ),
  )
  await writeFile(
    request.roverObsPath,
    'RINEX VERSION / TYPE\nEND OF HEADER\n> 2024 07 30 00 00 00.0000000  0 12\n> 2024 07 30 00 01 00.0000000  0 12\n',
  )
  return { executablePath, request }
}

function fakeChild(): ChildProcessWithoutNullStreams {
  const emitter = new EventEmitter()
  const child = Object.assign(emitter, {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null))
      return true
    }),
  }) as unknown as ChildProcessWithoutNullStreams
  return child
}

function fakeSender(): WebContents {
  const emitter = new EventEmitter()
  return Object.assign(emitter, {
    id: 1,
    isDestroyed: () => false,
    send: vi.fn(),
  }) as unknown as WebContents
}
