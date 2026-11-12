import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import { createGunzip } from 'node:zlib'
import {
  rinexObservationSpan,
  type RtkPostTimeSpan,
} from '../../../src/core/gnsslib/RtkPostProgress'

const SAMPLE_BYTES = 256 * 1024

/** Read only the beginning/end for ordinary files; gzip requires a streaming pass. */
export async function readRinexObservationSpan(
  filePath: string,
  signal?: AbortSignal,
): Promise<RtkPostTimeSpan | undefined> {
  signal?.throwIfAborted()
  const file = await fs.open(filePath, 'r')
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw new Error('Observation path is not a file')
    const length = Math.min(stat.size, SAMPLE_BYTES)
    const head = Buffer.alloc(length)
    const { bytesRead } = await file.read(head, 0, length, 0)
    signal?.throwIfAborted()
    if (bytesRead >= 2 && head[0] === 0x1f && head[1] === 0x8b) {
      const samples = await gzipSamples(filePath, signal)
      return parseSamples(samples.head, samples.tail)
    }
    // Unix compress (.Z) cannot be decoded by node:zlib.
    if (bytesRead >= 2 && head[0] === 0x1f && head[1] === 0x9d) return undefined
    const tail = Buffer.alloc(length)
    const tailRead = await file.read(tail, 0, length, Math.max(0, stat.size - length))
    signal?.throwIfAborted()
    return parseSamples(head.subarray(0, bytesRead), tail.subarray(0, tailRead.bytesRead))
  } finally {
    await file.close()
  }
}

function parseSamples(head: Buffer, tail: Buffer): RtkPostTimeSpan | undefined {
  const first = head.toString('ascii')
  if (!first.includes('RINEX VERSION / TYPE') || !first.includes('END OF HEADER')) return undefined
  return rinexObservationSpan(first, tail.toString('ascii'))
}

async function gzipSamples(
  filePath: string,
  signal?: AbortSignal,
): Promise<{ head: Buffer; tail: Buffer }> {
  const input = createReadStream(filePath)
  const output = createGunzip()
  const onError = (error: Error) => output.destroy(error)
  const onAbort = () => output.destroy(new Error('Observation span read cancelled'))
  input.on('error', onError)
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) onAbort()
  let head = Buffer.alloc(0)
  let tail = Buffer.alloc(0)
  try {
    for await (const data of input.pipe(output)) {
      const chunk = Buffer.from(data as Uint8Array)
      if (head.length < SAMPLE_BYTES) head = Buffer.concat([head, chunk]).subarray(0, SAMPLE_BYTES)
      tail = Buffer.concat([tail, chunk]).subarray(
        Math.max(0, tail.length + chunk.length - SAMPLE_BYTES),
      )
    }
    return { head, tail }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    input.destroy()
    output.destroy()
  }
}
