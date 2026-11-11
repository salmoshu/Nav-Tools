// RTCM/RINEX 解码 Worker：WASM 解码 + 列式数据集构建都在 Worker 线程，
// 主线程只收进度与最终数据集（结构化克隆）。
// 另支持一次性 RTCM→RINEX 转换（convert），与解码互不干扰。
import { RtcmDecoder, rtcm2rnx } from 'open-gnss-wasm'
import { GnssRawDatasetBuilder } from './dataset'
import type { GnssEvent, GnssRawKind } from './types'

const CHUNK_BYTES = 256 * 1024
const PROGRESS_EVERY_BYTES = 1024 * 1024

export interface RtcmWorkerRequest {
  type: 'decode' | 'convert' | 'stream-start' | 'stream-push' | 'stream-stop'
  /** 数据种类（decode 必填） */
  kind?: GnssRawKind
  /** 文件字节（转移所有权）；RINEX 支持多文件（obs+nav 合并） */
  buffers: ArrayBuffer[]
  /** convert：输出文件基名 */
  base?: string
}

let busy = false
let streamDecoder: Awaited<ReturnType<typeof RtcmDecoder.create>> | undefined
let streamBuilder: GnssRawDatasetBuilder | undefined
let lastStreamUpdate = 0
let queue = Promise.resolve()

self.onmessage = (event: MessageEvent<RtcmWorkerRequest>) => {
  const message = event.data
  if (!message) return
  queue = queue.then(() => processMessage(message)).catch((error: unknown) => {
    streamDecoder?.destroy()
    streamDecoder = undefined
    streamBuilder = undefined
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  })
}

async function processMessage(message: RtcmWorkerRequest): Promise<void> {
  if (message.type === 'stream-start') {
    streamDecoder?.destroy()
    streamDecoder = await RtcmDecoder.create()
    const decoder = streamDecoder
    streamBuilder = new GnssRawDatasetBuilder((sys, code, fcn) => decoder.codeFreq(sys, code, fcn))
    lastStreamUpdate = 0
    self.postMessage({ type: 'stream-started' })
    return
  }
  if (message.type === 'stream-push' || message.type === 'stream-stop') {
    if (!streamDecoder || !streamBuilder) return
    if (message.type === 'stream-push') {
      streamBuilder.push(streamDecoder.push(new Uint8Array(message.buffers[0])) as unknown as GnssEvent[])
    } else {
      streamBuilder.push(streamDecoder.flush() as unknown as GnssEvent[])
    }
    if (message.type === 'stream-stop' || Date.now() - lastStreamUpdate >= 1000) {
      lastStreamUpdate = Date.now()
      streamBuilder.setStats(streamDecoder.stats())
      self.postMessage({ type: message.type === 'stream-stop' ? 'done' : 'stream-update', dataset: streamBuilder.result() })
    }
    if (message.type === 'stream-stop') {
      streamDecoder.destroy()
      streamDecoder = undefined
      streamBuilder = undefined
    }
    return
  }
  if (busy) {
    self.postMessage({ type: 'error', message: 'decoder busy' })
    return
  }
  busy = true
  try {
    if (message.type === 'decode') await decode(message)
    else if (message.type === 'convert') await convert(message)
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    busy = false
  }
}

async function decode(message: RtcmWorkerRequest): Promise<void> {
  const decoder = await RtcmDecoder.create()
  try {
    const builder = new GnssRawDatasetBuilder((sys, code, fcn) =>
      decoder.codeFreq(sys, code, fcn),
    )
    if (message.kind === 'rnx') {
      // RINEX：逐文件投喂（obs+nav 累积合并），flush 一次性产出事件
      let index = 0
      for (const buffer of message.buffers) {
        decoder.pushRnx(new Uint8Array(buffer))
        index++
        self.postMessage({
          type: 'progress',
          done: index,
          total: message.buffers.length,
          stats: decoder.stats(),
        })
      }
      builder.push(decoder.flush() as unknown as GnssEvent[])
    } else {
      const bytes = new Uint8Array(message.buffers[0])
      const total = bytes.length
      let lastReport = 0
      for (let offset = 0; offset < total; offset += CHUNK_BYTES) {
        const events = decoder.push(bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, total)))
        builder.push(events as unknown as GnssEvent[])
        if (offset - lastReport >= PROGRESS_EVERY_BYTES) {
          lastReport = offset
          self.postMessage({ type: 'progress', done: offset, total, stats: decoder.stats() })
        }
      }
      builder.push(decoder.flush() as unknown as GnssEvent[])
    }
    const stats = decoder.stats()
    if (message.kind !== 'rnx' && stats.framesOk === 0) throw new Error('No valid RTCM3 frames were found; check the file format and CRC')
    builder.setStats(stats)
    self.postMessage({ type: 'done', dataset: builder.result() })
  } finally {
    decoder.destroy()
  }
}

async function convert(message: RtcmWorkerRequest): Promise<void> {
  const files = await rtcm2rnx(new Uint8Array(message.buffers[0]), message.base ?? 'output')
  self.postMessage(
    { type: 'converted', files },
    { transfer: files.map((file) => file.data.buffer as ArrayBuffer) },
  )
}
