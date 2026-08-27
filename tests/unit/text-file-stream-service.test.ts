import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TextFileStreamService as MainTextFileStreamService } from '../../electron/main/services/TextFileStreamService'
import { TextFileStreamService as RendererTextFileStreamService } from '@/core/file/TextFileStreamService'
import type { IpcListener, IpcTransport } from '@/core/platform/IpcTransport'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('main TextFileStreamService', () => {
  it('pulls a large UTF-8 file in bounded chunks without splitting characters', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'nav-tools-text-stream-'))
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, 'capture.log')
    const content = `${'A'.repeat(1024 * 1024 - 1)}中文\n${'B'.repeat(128 * 1024)}`
    await writeFile(filePath, content, 'utf8')

    const service = new MainTextFileStreamService()
    await service.start(7, { path: filePath, requestId: 'request-1' })
    const chunks: string[] = []
    let done = false
    while (!done) {
      const chunk = await service.read(7, 'request-1')
      chunks.push(chunk.data)
      done = chunk.done
    }

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(content)
  })
})

describe('renderer TextFileStreamService', () => {
  it('reports progress while pulling chunks through IPC', async () => {
    const responses = [
      { data: 'first', processedBytes: 5, totalBytes: 10, done: false },
      { data: 'second', processedBytes: 10, totalBytes: 10, done: true },
    ]
    const ipc: IpcTransport = {
      invoke: async <T>(channel: string) => {
        if (channel === 'text-file-stream-read') return responses.shift() as T
        return undefined as T
      },
      send: () => undefined,
      on: (_channel: string, _listener: IpcListener) => () => undefined,
    }
    const data: string[] = []
    const progress: number[] = []

    await new RendererTextFileStreamService(ipc).read('C:\\capture.log', {
      onChunk: (chunk) => data.push(chunk),
      onProgress: (value) => progress.push(value),
    })

    expect(data).toEqual(['first', 'second'])
    expect(progress).toEqual([50, 100])
  })
})
