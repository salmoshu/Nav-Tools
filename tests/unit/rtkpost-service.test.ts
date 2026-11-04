// @vitest-environment node

import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import type { WebContents } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RtkPostService } from '../../electron/main/services/RtkPostService'
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
})

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
