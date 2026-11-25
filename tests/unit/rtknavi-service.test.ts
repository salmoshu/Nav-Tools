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
import { parseRtkPostConfig } from '../../src/core/gnsslib/RtkPostConfig'
import { defaultStarRtkProcessing, parseStarRtkConfig } from '../../src/core/gnsslib/StarRtkConfig'
import { calculateNmeaChecksum } from '../../src/core/data/NmeaStreamParser'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => {
      const resolved = path.resolve(directory)
      if (
        path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
        !path.basename(resolved).startsWith('nav-tools-rtknavi-')
      ) {
        throw new Error(`Unexpected test directory: ${resolved}`)
      }
      return rm(resolved, { recursive: true, force: true })
    }),
  )
})

describe('RtkNaviService', () => {
  it('starts StarRTK with a YAML file and streams its POS records', async () => {
    const { workspace, request } = await createFixture()
    const base = path.join(workspace, 'base.rtcm3')
    const rover = request.inputs[0].path
    await Promise.all(
      [base, `${base}.tag`, `${rover}.tag`].map((file) => writeFile(file, 'fixture')),
    )
    request.engine = 'starrtk'
    request.inputs = [rover, base].map((path) => ({
      enabled: true,
      type: 'file',
      format: 'rtcm3',
      path,
      timeTag: true,
      replaySpeed: 10,
    }))
    request.starRtkProcessing = { ...defaultStarRtkProcessing(), single_epoch: true }
    request.starRtkTiming = { cycle_ms: 20, max_base_age_s: 0.5 }
    const child = fakeChild()
    const spawnMock = vi.fn().mockReturnValue(child)
    const sender = fakeSender()
    const service = new RtkNaviService(workspace, spawnMock as unknown as typeof spawn)
    try {
      await expect(service.start(sender, request)).resolves.toMatchObject({ state: 'running' })
      const [, args] = spawnMock.mock.calls[0]
      expect(args.slice(0, 2)).toEqual(['realtime', '--config'])
      const config = parseStarRtkConfig(await readFile(args[2], 'utf8'))
      expect(config).toMatchObject({
        processing: { single_epoch: true },
        realtime: {
          rover: { type: 'file', path: `${rover}::T::x10` },
          base: { type: 'file', path: `${base}::T::x10` },
          cycle_ms: 20,
          max_base_age_s: 0.5,
          solution_format: 'pos',
        },
      })
      await writeFile(request.outputPath, '2023/05/15 09:16:19.000 31.0 121.0 10.0 1 12\n')
      await vi.waitFor(() => {
        expect(sender.send).toHaveBeenCalledWith(
          'rtknavi-solution',
          expect.objectContaining({ epochs: 1 }),
        )
      })
    } finally {
      await service.stop(sender.id)
    }
  })

  it('starts StarRTK SPP with only the rover and ignores a saved base input', async () => {
    const { workspace, request } = await createFixture()
    request.engine = 'starrtk'
    request.starRtkProcessing = { ...defaultStarRtkProcessing(), positioning_mode: 'spp' }
    const rover = { ...request.inputs[0], timeTag: false }
    request.inputs = [rover, { ...rover, path: path.join(workspace, 'missing-base.rtcm3') }]
    const spawnMock = vi.fn().mockReturnValue(fakeChild())
    const sender = fakeSender()
    const service = new RtkNaviService(workspace, spawnMock as unknown as typeof spawn)
    try {
      await expect(service.start(sender, request)).resolves.toMatchObject({ state: 'running' })
      const config = parseStarRtkConfig(await readFile(spawnMock.mock.calls[0][1][2], 'utf8'))
      expect(config.processing.positioning_mode).toBe('spp')
      expect(config.realtime?.rover).toEqual({ type: 'file', path: rover.path })
      expect(config.realtime?.base).toBeUndefined()
    } finally {
      await service.stop(sender.id)
    }
  })

  it('keeps StarRTK NMEA sentences together across reads and drains the final epoch', async () => {
    const { workspace, request } = await createFixture()
    request.engine = 'starrtk'
    request.outputPath = ''
    request.starRtkSolutionFormat = 'nmea'
    request.inputs = [8881, 8882].map((port) => ({
      enabled: true,
      type: 'tcpcli',
      format: 'rtcm3',
      path: `127.0.0.1:${port}`,
      timeTag: false,
      replaySpeed: 1,
    }))
    const spawnMock = vi.fn().mockReturnValue(fakeChild())
    const sender = fakeSender()
    const service = new RtkNaviService(workspace, spawnMock as unknown as typeof spawn)
    try {
      const status = await service.start(sender, request)
      expect(status.solutionFormat).toBe('nmea')
      expect(status.outputPath).toBe(path.join(workspace, 'results', 'run-1.nmea'))
      const config = parseStarRtkConfig(await readFile(spawnMock.mock.calls[0][1][2], 'utf8'))
      expect(config.realtime).toMatchObject({
        solution_file: status.outputPath,
        solution_format: 'nmea',
      })

      const sentence = (body: string) => `${body}*${calculateNmeaChecksum(body)}`
      const record = (clock: string, date: string, quality: number) => [
        sentence(`$GPRMC,${clock},A,3100.0,S,12100.0,W,0,0,${date},,,A`),
        sentence('$GQGSV,1,1,01,03,62,115,47,0'),
        sentence(`$GPGGA,${clock},3100.0,S,12100.0,W,${quality},12,1.0,10.0,M,20.0,M,0.5,`),
      ]
      const first = record('235959.50', '300724', 4)
      const last = record('000000.50', '310724', 5)
      await writeFile(status.outputPath, [...first, last[0], ''].join('\r\n'))
      await vi.waitFor(() =>
        expect(sender.send).toHaveBeenCalledWith(
          'rtknavi-solution',
          expect.objectContaining({
            epochs: 1,
            records: [first.join('\n')],
            solution: expect.objectContaining({ time: '2024/07/30 23:59:59.500', quality: 1 }),
          }),
        ),
      )
      await appendFile(status.outputPath, last.slice(1).join('\n'))
      await service.stop(sender.id)
      expect(sender.send).toHaveBeenCalledWith(
        'rtknavi-solution',
        expect.objectContaining({
          epochs: 2,
          qualityCounts: { 1: 1, 2: 1 },
          records: [last.join('\n')],
          solution: expect.objectContaining({
            time: '2024/07/31 00:00:00.500',
            latitude: -31,
            longitude: -121,
            height: 30,
            quality: 2,
            satellites: 12,
            age: 0.5,
            ratio: null,
          }),
        }),
      )
    } finally {
      await service.stop(sender.id)
    }
  })

  it('passes edited advanced values to rtkrcv without replacing unedited base config values', async () => {
    const fixture = await createFixture()
    const configPath = path.join(fixture.workspace, 'custom.conf')
    await writeFile(configPath, 'pos2-arthres=6\npos2-thresdop=0.7\nstats-errphase=0.02\n')
    fixture.request.options.baseConfigPath = configPath
    fixture.request.options.ratioThreshold = 4.2
    fixture.request.advancedOptionOverrides = ['ratioThreshold']
    const child = fakeChild()
    const spawnMock = vi.fn().mockReturnValue(child)
    const sender = fakeSender()
    const service = new RtkNaviService(fixture.workspace, spawnMock as unknown as typeof spawn)
    try {
      await service.start(sender, fixture.request)
      const generated = await readFile(spawnMock.mock.calls[0][1][2], 'utf8')
      expect(parseRtkPostConfig(generated).options).toMatchObject({
        ratioThreshold: 4.2,
        dopplerSlipThresholdHz: 0.7,
        phaseErrorM: 0.02,
      })
    } finally {
      await service.stop(sender.id)
    }
  })
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
