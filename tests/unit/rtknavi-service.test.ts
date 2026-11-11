// @vitest-environment node

import { EventEmitter } from 'node:events'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { appendFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import type { WebContents } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RtkNaviService } from '../../electron/main/services/RtkNaviService'
import {
  createDefaultRtkNaviSettings,
  type RtkNaviStartRequest,
} from '../../src/core/gnsslib/RtkNavi'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('RtkNaviService', () => {
  it('waits for startup cancellation and preserves the previous solution file', async () => {
    const fixture = await createFixture()
    const oldResult = 'previous solution remains available\n'
    await writeFile(fixture.request.outputPath, oldResult)
    const spawnMock = vi.fn()
    const sender = fakeSender()
    const service = new RtkNaviService(fixture.workspace, spawnMock as unknown as typeof spawn)
    const starting = service.start(sender, fixture.request)
    const stopping = service.stop(sender.id, fixture.request.runId)
    expect(await starting).toMatchObject({ state: 'stopped' })
    expect(await stopping).toMatchObject({ state: 'stopped' })
    expect(spawnMock).not.toHaveBeenCalled()
    expect(await readFile(fixture.request.outputPath, 'utf8')).toBe(oldResult)
  })
  it('starts rtkrcv, streams solutions, stops gracefully and restarts', async () => {
    const fixture = await createFixture()
    const firstChild = fakeChild()
    const secondChild = fakeChild()
    const spawnMock = vi.fn().mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild)
    const sender = fakeSender()
    const service = new RtkNaviService(fixture.workspace, spawnMock as unknown as typeof spawn)

    try {
      const started = await service.start(sender, fixture.request)
      expect(started).toMatchObject({ state: 'running', outputPath: fixture.request.outputPath })
      const [executable, args, options] = spawnMock.mock.calls[0]
      expect(executable).toBe(fixture.executablePath)
      expect(args.slice(0, 2)).toEqual(['-nc', '-o'])
      expect(options).toMatchObject({ shell: false })
      const config = await readFile(args[2], 'utf8')
      expect(config).toContain('inpstr1-type =file')
      expect(config).toContain('outstr1-format =llh')
      await expect(stat(fixture.request.outputPath)).rejects.toThrow()

      await writeFile(
        fixture.request.outputPath,
        '2005/04/02 00:00:30.000 35.160874837 139.613834647 69.2997 1 7 0 0 0 0 0 0 1.50 2.80\n',
      )
      await vi.waitFor(
        () => {
          expect(sender.send).toHaveBeenCalledWith(
            'rtknavi-solution',
            expect.objectContaining({
              epochs: 1,
              solution: expect.objectContaining({ quality: 1, satellites: 7 }),
            }),
          )
        },
        { timeout: 3000 },
      )

      const remaining = Array.from({ length: 513 }, (_, index) => {
        const date = new Date(Date.UTC(2005, 3, 2, 0, 0, 31) + index * 1000)
        const time = date.toISOString().replaceAll('-', '/').replace('T', ' ').replace('Z', '')
        return `${time} 35.160874837 139.613834647 69.2997 2 8`
      })
      // Stop before the next poll and omit the last newline: exit must still drain it.
      await appendFile(fixture.request.outputPath, remaining.join('\n'))
      const stopped = await service.stop(sender.id, fixture.request.runId)
      const records = vi
        .mocked(sender.send)
        .mock.calls.filter(([channel]) => channel === 'rtknavi-solution')
        .flatMap(([, event]) => event.records)
      expect(records).toHaveLength(514)
      expect(records.at(-1)).toBe(remaining.at(-1))
      expect(
        vi
          .mocked(sender.send)
          .mock.calls.filter(([channel]) => channel === 'rtknavi-solution')
          .every(([, event]) => event.records.length <= 256),
      ).toBe(true)
      expect(stopped.state).toBe('stopped')
      expect(firstChild.kill).toHaveBeenCalled()
      await expect(stat(args[2])).rejects.toThrow()
      await expect(stat(fixture.request.outputPath)).resolves.toBeDefined()

      fixture.request.runId = 'run-2'
      await expect(service.start(sender, fixture.request)).resolves.toMatchObject({
        runId: 'run-2',
        state: 'running',
      })
      await service.stop(sender.id, 'run-2')
    } finally {
      await service.stop(sender.id)
    }
  })
})

async function createFixture(): Promise<{
  workspace: string
  executablePath: string
  request: RtkNaviStartRequest
}> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-rtknavi-'))
  directories.push(workspace)
  const executablePath = path.join(
    workspace,
    process.platform === 'win32' ? 'rtkrcv.exe' : 'rtkrcv',
  )
  const roverPath = path.join(workspace, 'rover.rtcm3')
  await Promise.all([writeFile(executablePath, 'fixture'), writeFile(roverPath, 'fixture')])
  const settings = createDefaultRtkNaviSettings()
  settings.options.mode = 0
  settings.executablePath = executablePath
  settings.outputPath = path.join(workspace, 'solution.pos')
  settings.inputs[0].path = roverPath
  return {
    workspace,
    executablePath,
    request: { ...settings, runId: 'run-1' },
  }
}

function fakeChild(): ChildProcessWithoutNullStreams {
  const emitter = new EventEmitter()
  const child = Object.assign(emitter, {
    pid: 1234,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: Object.assign(new EventEmitter(), {
      write: vi.fn(() => {
        queueMicrotask(() => child.emit('close', 0))
        return true
      }),
    }),
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
