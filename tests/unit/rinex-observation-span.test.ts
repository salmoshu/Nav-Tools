// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { readRinexObservationSpan } from '../../electron/main/services/RinexObservationSpan'
import {
  formatRtkPostTime,
  intersectObservationSpans,
} from '../../src/core/gnsslib/RtkPostProgress'

const tempDirs: string[] = []
afterEach(async () => {
  for (const directory of tempDirs.splice(0)) {
    const root = path.resolve(os.tmpdir()) + path.sep
    if (
      !path.resolve(directory).startsWith(root) ||
      !path.basename(directory).startsWith('nav-rinex-span-')
    )
      throw new Error('Unexpected temporary test directory')
    await rm(directory, { recursive: true, force: true })
  }
})

describe('RINEX observation span file reader', () => {
  it.skipIf(!process.env.NAV_RTK_ROVER || !process.env.NAV_RTK_BASE)(
    'reads and intersects optional real rover and base files',
    async () => {
      const rover = await readRinexObservationSpan(process.env.NAV_RTK_ROVER!)
      const base = await readRinexObservationSpan(process.env.NAV_RTK_BASE!)
      expect(rover).toBeDefined()
      expect(base).toBeDefined()
      const overlap = intersectObservationSpans(rover!, base!)
      expect(overlap).toBeDefined()
      if (process.env.NAV_RTK_EXPECT_START)
        expect(formatRtkPostTime(overlap!.start)).toBe(process.env.NAV_RTK_EXPECT_START)
      if (process.env.NAV_RTK_EXPECT_END)
        expect(formatRtkPostTime(overlap!.end)).toBe(process.env.NAV_RTK_EXPECT_END)
    },
  )
  it('reads real first and last RINEX 3 epochs from plain and gzip files', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'nav-rinex-span-'))
    tempDirs.push(dir)
    const header =
      '     3.04           OBSERVATION DATA    M: Mixed            RINEX VERSION / TYPE\n                                                            END OF HEADER\n'
    const contents =
      header +
      '> 2023 05 15 09 49 17.0000000  0 12\n' +
      'G01 observation\n'.repeat(30000) +
      '> 2023 05 15 10 00 47.0000000  0 12\n'
    const raw = path.join(dir, 'rover.obs')
    const gzip = path.join(dir, 'rover.obs.gz')
    await writeFile(raw, contents)
    await writeFile(gzip, gzipSync(contents))
    const expected = {
      start: Date.UTC(2023, 4, 15, 9, 49, 17),
      end: Date.UTC(2023, 4, 15, 10, 0, 47),
    }
    expect(await readRinexObservationSpan(raw)).toEqual(expected)
    expect(await readRinexObservationSpan(gzip)).toEqual(expected)
  })

  it('does not invent times for non-RINEX or Unix-compressed data, and honors cancellation', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'nav-rinex-span-'))
    tempDirs.push(dir)
    const file = path.join(dir, 'input')
    await writeFile(file, Buffer.from([0x1f, 0x9d, 0x90, 0x00]))
    expect(await readRinexObservationSpan(file)).toBeUndefined()
    await writeFile(file, 'not an observation file')
    expect(await readRinexObservationSpan(file)).toBeUndefined()
    const controller = new AbortController()
    controller.abort()
    await expect(readRinexObservationSpan(file, controller.signal)).rejects.toThrow()
  })
})
