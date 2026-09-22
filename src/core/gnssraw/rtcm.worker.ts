// RTCM 解码 Worker：WASM 解码 + 列式数据集构建都在 Worker 线程，
// 主线程只收进度与最终数据集（结构化克隆）。
import { RtcmDecoder } from 'robo-gnss-wasm'
import { GnssRawDatasetBuilder } from './dataset'
import type { GnssEvent } from './types'

const CHUNK_BYTES = 256 * 1024
const PROGRESS_EVERY_BYTES = 1024 * 1024

export interface RtcmWorkerRequest {
  type: 'decode'
  /** 文件字节（转移所有权） */
  buffer: ArrayBuffer
}

let busy = false

self.onmessage = async (event: MessageEvent<RtcmWorkerRequest>) => {
  const message = event.data
  if (!message || message.type !== 'decode') return
  if (busy) {
    self.postMessage({ type: 'error', message: 'decoder busy' })
    return
  }
  busy = true
  try {
    await decode(message.buffer)
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    busy = false
  }
}

async function decode(buffer: ArrayBuffer): Promise<void> {
  const bytes = new Uint8Array(buffer)
  const total = bytes.length
  const decoder = await RtcmDecoder.create()
  try {
    const builder = new GnssRawDatasetBuilder((sys, code, fcn) =>
      decoder.codeFreq(sys, code, fcn),
    )
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
    builder.setStats(decoder.stats())
    self.postMessage({ type: 'done', dataset: builder.result() })
  } finally {
    decoder.destroy()
  }
}
