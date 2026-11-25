// @vitest-environment node

import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { WebContents } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RtkPostService } from '../../electron/main/services/RtkPostService'
import { validateNmeaChecksum } from '../../src/core/data/NmeaStreamParser'
import { parseRtkPostConfig } from '../../src/core/gnsslib/RtkPostConfig'
import {
  createDefaultRtkPostSettings,
  type RtkPostRunRequest,
} from '../../src/core/gnsslib/RtkPost'
import { defaultStarRtkProcessing } from '../../src/core/gnsslib/StarRtkConfig'

// Opt in with an existing native build and the Open-GNSS tests/fixtures/rinex directory.
const executable = process.env.RNX2RTKP_TEST_EXECUTABLE
const fixtures = process.env.RNX2RTKP_TEST_FIXTURES
const exExecutable = process.env.RTKLIB_EX_TEST_EXECUTABLE
const exFixtures = process.env.RTKLIB_EX_TEST_FIXTURES
const starExecutable = process.env.STARRTK_TEST_EXECUTABLE
const starDataset = process.env.STARRTK_TEST_DATASET
const directories: string[] = []

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    const target = path.resolve(directory)
    if (
      path.dirname(target) !== path.resolve(os.tmpdir()) ||
      !path.basename(target).startsWith('nav-tools-native-rtkpost-')
    )
      throw new Error('Unexpected temporary test directory')
    await rm(target, { recursive: true, force: true })
  }
})

describe.skipIf(!exExecutable || !exFixtures)('RTKLIB-EX native engine integration', () => {
  it('uses the native .conf to solve without a base station and produces valid NMEA', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-native-rtkpost-'))
    directories.push(directory)
    const configPath = path.join(directory, 'native.conf')
    const outputPath = path.join(directory, 'solution.nmea')
    await writeFile(configPath, 'pos1-posmode=single\npos1-navsys=1\nout-solformat=nmea\n')
    const defaults = createDefaultRtkPostSettings()
    const result = await new RtkPostService().run(sender(), {
      ...defaults,
      engine: 'rtklib-ex',
      runId: 'native-ex',
      executablePath: exExecutable!,
      configPath,
      roverObsPath: path.join(exFixtures!, '07590920.05o'),
      navPaths: [path.join(exFixtures!, '30400920.05n')],
      outputPath,
      options: {
        ...defaults.options,
        startTime: '2005-04-02T00:00:30',
        endTime: '2005-04-02T00:01:30',
      },
    })
    expect(result.ok, result.error ?? result.log).toBe(true)
    const gga = (await readFile(outputPath, 'utf8')).split(/\r?\n/).filter((line) => /^\$..GGA,/.test(line))
    expect(gga.length).toBeGreaterThan(0)
    expect(gga.every(validateNmeaChecksum)).toBe(true)
    expect(result.solution).toMatchObject({ format: 'nmea', epochs: gga.length, single: gga.length })
  })
})

describe.skipIf(!executable || !fixtures)('RTKPOST native engine integration', () => {
  it('uses NMEA after loading the config selection into the form', async () => {
    const request = await createRequest()
    request.configPath = path.join(path.dirname(request.outputPath), 'nmea.conf')
    const configContent = 'out-solformat =nmea\n'
    await writeFile(request.configPath, configContent)
    Object.assign(request.options, parseRtkPostConfig(configContent).options)
    const result = await new RtkPostService().run(sender(), request)
    expect(request.options.outputFormat).toBe('nmea')
    expect(result.ok, result.error ?? result.log).toBe(true)
    const text = await readFile(request.outputPath, 'utf8')
    const gga = text.split(/\r?\n/).filter((line) => /^\$..GGA,/.test(line))
    expect(gga.length).toBeGreaterThan(0)
    expect(result.solution).toMatchObject({
      epochs: gga.length,
      fixed: gga.filter((line) => line.split(',')[6] === '4').length,
      float: gga.filter((line) => line.split(',')[6] === '5').length,
      single: gga.filter((line) => line.split(',')[6] === '1').length,
    })
  })
  it('catches the real no-nav diagnostic despite the engine returning zero', async () => {
    const request = await createRequest()
    // A readable OBS in the NAV slot reproduces "no nav data" without bypassing input validation.
    request.navPaths = [request.roverObsPath]
    const result = await new RtkPostService().run(sender(), request)
    expect(result).toMatchObject({
      ok: false,
      exitCode: 0,
      error: expect.stringContaining('no nav data'),
    })
    expect(result.solution).toBeUndefined()
  })
  it('limits native solutions to the selected GPST time range', async () => {
    const request = await createRequest()
    request.options.startTime = '2005-04-02T00:00:30'
    request.options.endTime = '2005-04-02T00:01:00'
    const result = await new RtkPostService().run(sender(), request)
    expect(result.ok, result.error ?? result.log).toBe(true)
    const text = await readFile(request.outputPath, 'utf8')
    const timestamps = text
      .split(/\r?\n/)
      .filter((line) => /^2005\/04\/02\s/.test(line))
      .map((line) => line.slice(0, 19))
    expect(timestamps.length).toBeGreaterThan(0)
    expect(
      timestamps.every((time) => time >= '2005/04/02 00:00:30' && time <= '2005/04/02 00:01:00'),
    ).toBe(true)
  })

  it.each([0, 1, 2] as const)(
    'returns a fresh solution and monotonic measured progress for direction %i',
    async (solutionType) => {
      const request = await createRequest()
      request.options.solutionType = solutionType
      const webContents = sender()
      const result = await new RtkPostService().run(webContents, request)
      expect(result.ok, result.error ?? result.log).toBe(true)
      expect(result.solution!.epochs).toBeGreaterThan(0)
      const progress = vi
        .mocked(webContents.send)
        .mock.calls.filter(
          ([channel, event]) => channel === 'rtkpost-progress' && event.phase === 'processing',
        )
        .map(([, event]) => event.percentage as number)
      expect(progress.length).toBeGreaterThan(1)
      expect(progress).not.toContain(null)
      expect(progress).toEqual([...progress].sort((a, b) => a - b))
      expect(Math.max(...progress)).toBeLessThan(100)
      expect(result.log).not.toContain('processing :')
      expect(result.progress?.processingMessage).toMatch(/^processing : .* Q=\d/)
    },
  )

  it.each([
    ['llh', 'tow'],
    ['xyz', 'tow'],
    ['enu', 'tow'],
    ['xyz', 'hms'],
    ['enu', 'hms'],
    ['nmea', 'hms'],
  ] as const)('accepts native %s solutions using %s times', async (outputFormat, timeFormat) => {
    const request = await createRequest()
    Object.assign(request.options, { outputFormat, timeFormat })
    const result = await new RtkPostService().run(sender(), request)
    expect(result.ok, result.error ?? result.log).toBe(true)
    expect(result.solution!.epochs).toBeGreaterThan(0)
  })
})

describe.skipIf(!starExecutable || !starDataset)('StarRTK native post-processing', () => {
  it.each([
    ['spp', 'single'],
    ['rtd', 'dgps'],
  ] as const)(
    'starts StarRTK %s and publishes only the selected solution quality',
    async (mode, quality) => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-native-rtkpost-'))
      directories.push(directory)
      const request: RtkPostRunRequest = {
        ...createDefaultRtkPostSettings(),
        engine: 'starrtk',
        starRtkProcessing: { ...defaultStarRtkProcessing(), positioning_mode: mode },
        runId: 'starrtk-mode',
        executablePath: starExecutable!,
        baseObsPath:
          mode === 'spp'
            ? path.join(directory, 'missing-base.obs')
            : path.join(starDataset!, '202404231726.base.obs'),
        roverObsPath: path.join(starDataset!, '202404231726.rover.obs'),
        navPaths: [path.join(starDataset!, '202404231726.rover.nav')],
        outputPath: path.join(directory, 'solution.pos'),
      }
      const result = await new RtkPostService().run(sender(), request)
      expect(result.ok, result.error ?? result.log).toBe(true)
      expect(result.solution).toMatchObject({ epochs: 813, fixed: 0, float: 0, [quality]: 813 })
    },
    30_000,
  )

  it.each(['llh', 'nmea'] as const)(
    'publishes the %s result for the StarRTK sample',
    async (format) => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-native-rtkpost-'))
      directories.push(directory)
      const request: RtkPostRunRequest = {
        ...createDefaultRtkPostSettings(),
        engine: 'starrtk',
        starRtkProcessing: defaultStarRtkProcessing(),
        runId: 'starrtk-native',
        executablePath: starExecutable!,
        baseObsPath: path.join(starDataset!, '202404231726.base.obs'),
        roverObsPath: path.join(starDataset!, '202404231726.rover.obs'),
        navPaths: [path.join(starDataset!, '202404231726.rover.nav')],
        outputPath: path.join(directory, format === 'nmea' ? 'solution.nmea' : 'solution.pos'),
      }
      request.options.outputFormat = format
      await writeFile(request.outputPath, 'previous result')

      const result = await new RtkPostService().run(sender(), request)
      expect(result.ok, result.error ?? result.log).toBe(true)
      expect(result.solution).toMatchObject({
        format: format === 'nmea' ? 'nmea' : 'rtklib-pos',
        epochs: 813,
      })
      expect(result.solution?.fixed).toBeGreaterThanOrEqual(812)
      expect(result.progress?.processingTime).toBe('2024/04/23 09:50:23.000')

      const text = await readFile(request.outputPath, 'utf8')
      if (format === 'nmea') {
        const lines = text.trimEnd().split('\r\n')
        const positions = lines.filter((line) => /^\$..GGA,/.test(line))
        expect(positions).toHaveLength(813)
        expect(lines.filter((line) => /^\$..RMC,/.test(line))).toHaveLength(813)
        expect(lines.every(validateNmeaChecksum)).toBe(true)
        expect(lines[0]).toMatch(/^\$..RMC,093633\.00,A,/)
        expect(positions[0]).toMatch(/^\$..GGA,093633\.00,(?:[^,]+,){4}[45],/)
        expect(Number(positions[0].split(',')[7])).toBeGreaterThan(13)
        expect(positions.filter((line) => line.split(',')[6] === '4')).toHaveLength(
          result.solution!.fixed,
        )
      } else {
        expect(text).toContain('GPST')
        expect(text).toContain('2024/04/23 09:36:51.000')
      }
    },
    30_000,
  )
})

async function createRequest(): Promise<RtkPostRunRequest> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-native-rtkpost-'))
  directories.push(directory)
  return {
    ...createDefaultRtkPostSettings(),
    runId: 'native-run',
    executablePath: executable!,
    roverObsPath: path.join(fixtures!, '07590920.05o'),
    baseObsPath: path.join(fixtures!, '30400920.05o'),
    navPaths: [path.join(fixtures!, '30400920.05n')],
    outputPath: path.join(directory, 'solution.pos'),
  }
}

function sender(): WebContents {
  return Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    send: vi.fn(),
  }) as unknown as WebContents
}
