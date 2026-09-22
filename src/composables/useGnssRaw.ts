// GNSS-Raw 全局单例状态（对齐 useMcapPlayer 的模块级单例模式）：
// 持有解码 Worker、加载进度与列式数据集，所有 GNSS-Raw 面板共享。
// 支持 RTCM 二进制流（单文件）与 RINEX 文本（obs/nav 多文件合并）。
import { ref, shallowRef } from 'vue'
import {
  detectGnssRawKind,
  isRtcmFileName,
  readRtcmFromFile,
  readRtcmFromPath,
  sniffRtcm,
  type LoadedRtcmBytes,
} from '@/core/gnssraw/RtcmFileAccess'
import type { GnssRawDataset, GnssRawKind, GnssStreamStats } from '@/core/gnssraw/types'
import { RecentInputFiles } from '@/core/file/RecentInputFiles'
import { JsonStorage } from '@/core/storage/JsonStorage'

export type GnssRawStatus = 'idle' | 'loading' | 'ready' | 'error'
export interface RnxOutputFile {
  name: string
  data: Uint8Array
}

const status = ref<GnssRawStatus>('idle')
const errorText = ref('')
const kind = ref<GnssRawKind | null>(null)
const fileInfo = ref<{ name: string; path?: string; sizeBytes: number; count: number } | null>(null)
const progress = ref<{ done: number; total: number } | null>(null)
const liveStats = shallowRef<GnssStreamStats | null>(null)
const dataset = shallowRef<GnssRawDataset | null>(null)

const recentStore = new RecentInputFiles(new JsonStorage(localStorage))

let worker: Worker | null = null
let loadSeq = 0
/** RTCM 源字节（导出 RINEX 用；RINEX 源不需要保留） */
let sourceBytes: Uint8Array | null = null

function workerUrl(): URL {
  return new URL('../core/gnssraw/rtcm.worker.ts', import.meta.url)
}

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(workerUrl(), { type: 'module' })
  return worker
}

function teardownWorker(): void {
  worker?.terminate()
  worker = null
}

async function startLoad(loadKind: GnssRawKind, items: LoadedRtcmBytes[]): Promise<void> {
  const seq = ++loadSeq
  teardownWorker()
  status.value = 'loading'
  errorText.value = ''
  kind.value = loadKind
  fileInfo.value = {
    name: items[0].name,
    path: items[0].path,
    sizeBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
    count: items.length,
  }
  progress.value = { done: 0, total: items.length }
  liveStats.value = null
  dataset.value = null
  sourceBytes = loadKind === 'rtcm' ? items[0].bytes : null
  for (const item of items) {
    if (item.path) {
      recentStore.record({ path: item.path, name: item.name, sizeBytes: item.sizeBytes })
    }
  }

  const w = ensureWorker()
  const buffers = items.map(
    (item) =>
      item.bytes.buffer.slice(
        item.bytes.byteOffset,
        item.bytes.byteOffset + item.bytes.byteLength,
      ) as ArrayBuffer,
  )

  await new Promise<void>((resolve) => {
    w.onmessage = (event: MessageEvent) => {
      if (seq !== loadSeq) return resolve()
      const message = event.data
      if (message?.type === 'progress') {
        progress.value = { done: message.done as number, total: message.total as number }
        liveStats.value = message.stats as GnssStreamStats
        return
      }
      if (message?.type === 'done') {
        dataset.value = message.dataset as GnssRawDataset
        status.value = 'ready'
        progress.value = null
        return resolve()
      }
      if (message?.type === 'error') {
        errorText.value = String(message.message ?? 'decode failed')
        status.value = 'error'
        progress.value = null
        return resolve()
      }
    }
    w.onerror = (event) => {
      if (seq !== loadSeq) return resolve()
      const detail = event.message?.trim()
      const where = event.filename
        ? ` (${event.filename.split('/').pop() ?? ''}:${event.lineno ?? 0})`
        : ''
      errorText.value = detail
        ? `${detail}${where}`
        : 'GNSS-Raw 解码 Worker 启动失败，请刷新页面或重启应用后重试'
      status.value = 'error'
      progress.value = null
      resolve()
    }
    w.postMessage({ type: 'decode', kind: loadKind, buffers }, buffers)
  })
}

async function loadItems(items: LoadedRtcmBytes[]): Promise<boolean> {
  const kinds = items.map((item) => detectGnssRawKind(item.name, item.bytes.subarray(0, 8192)))
  const first = kinds[0]
  const fail = (text: string): boolean => {
    errorText.value = text
    status.value = 'error'
    fileInfo.value = { name: items[0].name, path: items[0].path, sizeBytes: items[0].sizeBytes, count: items.length }
    return false
  }
  if (!first) return fail('无法识别的数据格式（既非 RTCM3 流，也非 RINEX 文件）')
  if (!kinds.every((itemKind) => itemKind === first)) {
    return fail('请一次加载同类型文件：RTCM 单文件，或 RINEX obs/nav 组合')
  }
  if (first === 'rtcm' && items.length > 1) return fail('RTCM 流文件请一次加载一个')
  await startLoad(first, items)
  return status.value === 'ready'
}

export function useGnssRaw() {
  /** 浏览器 File 对象（拖拽 / input[type=file]）；RINEX 可多选（obs+nav）。 */
  async function loadFromFiles(files: File[]): Promise<boolean> {
    const items = await Promise.all(files.map((file) => readRtcmFromFile(file)))
    return loadItems(items)
  }

  /** 单 File 兼容入口。 */
  async function loadFromFile(file: File): Promise<boolean> {
    return loadFromFiles([file])
  }

  /** 本地路径（Electron 对话框 / 最近文件）；RINEX 可多个（obs+nav）。 */
  async function loadFromPaths(paths: string[]): Promise<boolean> {
    try {
      const items = await Promise.all(paths.map((path) => readRtcmFromPath(path)))
      return await loadItems(items)
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
      status.value = 'error'
      return false
    }
  }

  /** 单路径兼容入口。 */
  async function loadFromPath(path: string): Promise<boolean> {
    return loadFromPaths([path])
  }

  /**
   * 将当前 RTCM 源转换为 RINEX 文件集（obs+nav，RINEX 3.04）。
   * 一次性 Worker 内执行，不占用解码 Worker。
   */
  async function convertToRnx(): Promise<RnxOutputFile[]> {
    if (kind.value !== 'rtcm' || !sourceBytes) {
      throw new Error('仅 RTCM 数据源可导出 RINEX')
    }
    const base = (fileInfo.value?.name ?? 'output').replace(/\.[^.]*$/, '') || 'output'
    const buffer = sourceBytes.buffer.slice(
      sourceBytes.byteOffset,
      sourceBytes.byteOffset + sourceBytes.byteLength,
    ) as ArrayBuffer
    const convertWorker = new Worker(workerUrl(), { type: 'module' })
    try {
      return await new Promise<RnxOutputFile[]>((resolve, reject) => {
        convertWorker.onmessage = (event: MessageEvent) => {
          const message = event.data
          if (message?.type === 'converted') resolve(message.files as RnxOutputFile[])
          else if (message?.type === 'error') reject(new Error(String(message.message)))
        }
        convertWorker.onerror = (event) =>
          reject(
            new Error(
              event.message?.trim() ||
                'RINEX 转换 Worker 启动失败，请刷新页面或重启应用后重试',
            ),
          )
        convertWorker.postMessage({ type: 'convert', buffers: [buffer], base }, [buffer])
      })
    } finally {
      convertWorker.terminate()
    }
  }

  function reset(): void {
    loadSeq++
    teardownWorker()
    status.value = 'idle'
    errorText.value = ''
    kind.value = null
    fileInfo.value = null
    progress.value = null
    liveStats.value = null
    dataset.value = null
    sourceBytes = null
  }

  function recentFiles() {
    return recentStore.list()
  }

  return {
    status,
    errorText,
    kind,
    fileInfo,
    progress,
    liveStats,
    dataset,
    loadFromFile,
    loadFromFiles,
    loadFromPath,
    loadFromPaths,
    convertToRnx,
    reset,
    recentFiles,
    isRtcmFileName,
    sniffRtcm,
  }
}
