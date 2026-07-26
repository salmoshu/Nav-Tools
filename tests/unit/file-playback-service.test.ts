// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildReplayCheckpoints,
  FilePlaybackService,
  parseRtklibTimeTag,
} from '../../electron/main/services/FilePlaybackService'
import {
  createRtklibTimeTagHeader,
  createRtklibTimeTagRecord,
} from '../../electron/main/services/LogRecordingService'

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('FilePlaybackService', () => {
  it('parses RTKLIB records with 4-byte and 8-byte file positions', () => {
    const header = createRtklibTimeTagHeader(1_700_000_000_000)
    const tag4 = Buffer.concat([
      header,
      createRtklibTimeTagRecord(25, 12, 4),
      createRtklibTimeTagRecord(50, 34, 4),
    ])
    const tag8 = Buffer.concat([header, createRtklibTimeTagRecord(75, 5_000_000_000, 8)])

    expect(parseRtklibTimeTag(tag4, 4)).toEqual([
      { tick: 25, position: 12 },
      { tick: 50, position: 34 },
    ])
    expect(parseRtklibTimeTag(tag8, 8)).toEqual([{ tick: 75, position: 5_000_000_000 }])
  })

  it('matches Nav-Bridge checkpoint release timing', () => {
    expect(
      buildReplayCheckpoints(
        [
          { tick: 50, position: 2 },
          { tick: 100, position: 6 },
        ],
        8,
      ),
    ).toEqual([
      { tick: 0, position: 2 },
      { tick: 50, position: 6 },
      { tick: 100, position: 8 },
    ])
  })

  it('streams a data file according to its sibling tag file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-playback-'))
    tempDirectories.push(directory)
    const filePath = path.join(directory, 'capture.log')
    await writeFile(filePath, 'abcdef')
    await writeFile(
      `${filePath}.tag`,
      Buffer.concat([
        createRtklibTimeTagHeader(Date.now()),
        createRtklibTimeTagRecord(10, 2),
        createRtklibTimeTagRecord(20, 6),
      ]),
    )

    const data: string[] = []
    let finish: () => void = () => undefined
    const completed = new Promise<void>((resolve) => {
      finish = resolve
    })
    const sender = {
      isDestroyed: () => false,
      send(channel: string, payload: unknown) {
        if (channel === 'file-playback-data') data.push(String(payload))
        if (
          channel === 'file-playback-status' &&
          (payload as { state?: string }).state === 'completed'
        ) {
          finish()
        }
      },
    }

    await new FilePlaybackService().start(
      1,
      { path: filePath, replaySpeed: 100, startOffset: 0, filePositionBytes: 4 },
      sender,
    )
    await completed

    expect(data.join('')).toBe('abcdef')
    expect(await readFile(filePath, 'utf8')).toBe('abcdef')
  })

  it('coalesces dense checkpoints before sending renderer IPC events', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-playback-batch-'))
    tempDirectories.push(directory)
    const filePath = path.join(directory, 'capture.log')
    const content = 'x'.repeat(1000)
    await writeFile(filePath, content)
    await writeFile(
      `${filePath}.tag`,
      Buffer.concat([
        createRtklibTimeTagHeader(Date.now()),
        ...Array.from({ length: content.length }, (_, index) =>
          createRtklibTimeTagRecord(index, index + 1),
        ),
      ]),
    )

    const deliveries: string[] = []
    let finish: () => void = () => undefined
    const completed = new Promise<void>((resolve) => {
      finish = resolve
    })
    const sender = {
      isDestroyed: () => false,
      send(channel: string, payload: unknown) {
        if (channel === 'file-playback-data') deliveries.push(String(payload))
        if (
          channel === 'file-playback-status' &&
          (payload as { state?: string }).state === 'completed'
        ) {
          finish()
        }
      },
    }

    await new FilePlaybackService().start(
      1,
      { path: filePath, replaySpeed: 1000, startOffset: 0, filePositionBytes: 4 },
      sender,
    )
    await completed

    expect(deliveries.join('')).toBe(content)
    expect(deliveries.length).toBeLessThanOrEqual(5)
  })

  it('lets stop requests interrupt playback that is behind schedule', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-playback-stop-'))
    tempDirectories.push(directory)
    const filePath = path.join(directory, 'capture.log')
    const data = 'x'.repeat(5000)
    await writeFile(filePath, data)
    await writeFile(
      `${filePath}.tag`,
      Buffer.concat([
        createRtklibTimeTagHeader(Date.now()),
        ...Array.from({ length: data.length }, (_, index) =>
          createRtklibTimeTagRecord(0, index + 1),
        ),
      ]),
    )

    const states: string[] = []
    const sender = {
      isDestroyed: () => false,
      send(channel: string, payload: unknown) {
        if (channel === 'file-playback-status') {
          states.push(String((payload as { state?: string }).state))
        }
      },
    }
    const service = new FilePlaybackService()

    await service.start(1, { path: filePath, replaySpeed: 100 }, sender)
    await service.stop(1)
    await new Promise((resolve) => setImmediate(resolve))

    expect(states).toContain('stopped')
    expect(states).not.toContain('completed')
  })

  it('rejects an invalid time-tag header', () => {
    expect(() => parseRtklibTimeTag(Buffer.alloc(76), 4, 'broken.tag')).toThrow(
      'RTKLIB 时间戳文件头无效',
    )
  })
})
