// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseRtklibTimeTag } from '../../electron/main/services/FilePlaybackService'
import {
  createRtklibTimeTagHeader,
  LogRecordingService,
} from '../../electron/main/services/LogRecordingService'

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('LogRecordingService', () => {
  it('creates the same RTKLIB time-tag header used by Nav-Bridge', () => {
    const header = createRtklibTimeTagHeader(1_700_000_000_123)

    expect(header).toHaveLength(76)
    expect(header.subarray(0, 14).toString('ascii')).toBe('TIMETAG RTKLIB')
    expect(header.readUInt32LE(60)).toBe(1_700_000_000_123 >>> 0)
    expect(header.readUInt32LE(64)).toBe(Math.floor(1_700_000_000_123 / 1000))
    expect(header.readDoubleLE(68)).toBe(0)
  })

  it('writes a data log and cumulative byte positions to its sibling tag file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-recording-'))
    tempDirectories.push(directory)
    const filePath = path.join(directory, 'capture.log')
    const statuses: string[] = []
    const sender = {
      isDestroyed: () => false,
      send(channel: string, payload: unknown) {
        if (channel === 'log-recording-status') {
          statuses.push((payload as { state: string }).state)
        }
      },
    }
    const service = new LogRecordingService()

    await service.start(1, filePath, sender)
    service.write(1, 'ab')
    service.write(1, '中文')
    await service.stop(1)

    expect(await readFile(filePath, 'utf8')).toBe('ab中文')
    const entries = parseRtklibTimeTag(await readFile(`${filePath}.tag`), 4)
    expect(entries.map((entry) => entry.position)).toEqual([2, 8])
    expect(entries[1].tick).toBeGreaterThanOrEqual(entries[0].tick)
    expect(statuses).toEqual(['recording', 'stopped'])
  })
})
