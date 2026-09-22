// GNSS-Raw 全局单例状态（对齐 useMcapPlayer 的模块级单例模式）：
// 持有 RTCM 解码 Worker、加载进度与列式数据集，所有 GNSS-Raw 面板共享。
import { ref, shallowRef } from 'vue'
import {
  isRtcmFileName,
  readRtcmFromFile,
  readRtcmFromPath,
  sniffRtcm,
  type LoadedRtcmBytes,
} from '@/core/gnssraw/RtcmFileAccess'
import type { GnssRawDataset, GnssStreamStats } from '@/core/gnssraw/types'
import { RecentInputFiles } from '@/core/file/RecentInputFiles'
import { JsonStorage } from '@/core/storage/JsonStorage'

export type GnssRawStatus = 'idle' | 'loading' | 'ready' | 'error'

const status = ref<GnssRawStatus>('idle')
const errorText = ref('')
const fileInfo = ref<{ name: string; path?: string; sizeBytes: number } | null>(null)
const progress = ref<{ done: number; total: number } | null>(null)
const liveStats = shallowRef<GnssStreamStats | null>(null)
const dataset = shallowRef<GnssRawDataset | null>(null)

const recentStore = new RecentInputFiles(new JsonStorage(localStorage))

let worker: Worker | null = null
let loadSeq = 0

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../core/gnssraw/rtcm.worker.ts', import.meta.url), {
    type: 'module',
  })
  return worker
}

function teardownWorker(): void {
  worker?.terminate()
  worker = null
}

async function startLoad(loaded: LoadedRtcmBytes): Promise<void> {
  const seq = ++loadSeq
  teardownWorker()
  status.value = 'loading'
  errorText.value = ''
  fileInfo.value = { name: loaded.name, path: loaded.path, sizeBytes: loaded.sizeBytes }
  progress.value = { done: 0, total: loaded.sizeBytes }
  liveStats.value = null
  dataset.value = null
  if (loaded.path) {
    recentStore.record({ path: loaded.path, name: loaded.name, sizeBytes: loaded.sizeBytes })
  }

  const w = ensureWorker()
  const buffer = loaded.bytes.buffer.slice(
    loaded.bytes.byteOffset,
    loaded.bytes.byteOffset + loaded.bytes.byteLength,
  ) as ArrayBuffer

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
      errorText.value = event.message || 'RTCM 解码 Worker 启动失败'
      status.value = 'error'
      progress.value = null
      resolve()
    }
    w.postMessage({ type: 'decode', buffer }, [buffer])
  })
}

export function useGnssRaw() {
  /** 浏览器 File 对象（拖拽 / input[type=file]）。 */
  async function loadFromFile(file: File): Promise<boolean> {
    const loaded = await readRtcmFromFile(file)
    return loadChecked(loaded)
  }

  /** 本地路径（Electron 对话框 / 最近文件）。 */
  async function loadFromPath(path: string): Promise<boolean> {
    try {
      const loaded = await readRtcmFromPath(path)
      return await loadChecked(loaded)
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
      status.value = 'error'
      return false
    }
  }

  /** 已读好的字节（自定义来源），带 RTCM 内容嗅探。 */
  async function loadChecked(loaded: LoadedRtcmBytes): Promise<boolean> {
    if (!sniffRtcm(loaded.bytes)) {
      errorText.value = '文件内容不是有效的 RTCM3 流'
      status.value = 'error'
      fileInfo.value = { name: loaded.name, path: loaded.path, sizeBytes: loaded.sizeBytes }
      return false
    }
    await startLoad(loaded)
    return status.value === 'ready'
  }

  function reset(): void {
    loadSeq++
    teardownWorker()
    status.value = 'idle'
    errorText.value = ''
    fileInfo.value = null
    progress.value = null
    liveStats.value = null
    dataset.value = null
  }

  function recentFiles() {
    return recentStore.list()
  }

  return {
    status,
    errorText,
    fileInfo,
    progress,
    liveStats,
    dataset,
    loadFromFile,
    loadFromPath,
    loadChecked,
    reset,
    recentFiles,
    isRtcmFileName,
    sniffRtcm,
  }
}
