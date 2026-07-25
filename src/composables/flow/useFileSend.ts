import { ref, computed } from 'vue'
import { activeDataTransport } from '@/core/device/ActiveDataTransport'
import { useConsole } from './useConsole'

export type FileSendStatus = 'idle' | 'loaded' | 'sending' | 'success' | 'error' | 'cancelled'

export interface FileSendState {
  fileName: string
  fileSize: number
  bytesSent: number
  status: FileSendStatus
  ackedChunks: number
  totalChunks: number
  error: string | null
  startTime: number
  elapsedTime: number
}

const DEFAULT_CHUNK_SIZE = 1024

const initialState: FileSendState = {
  fileName: '',
  fileSize: 0,
  bytesSent: 0,
  status: 'idle',
  ackedChunks: 0,
  totalChunks: 0,
  error: null,
  startTime: 0,
  elapsedTime: 0,
}

let globalFileSendInstance: ReturnType<typeof createFileSend> | null = null

function createFileSend() {
  const state = ref<FileSendState>({ ...initialState })
  const cancelled = ref(false)
  const stagedFile = ref<File | null>(null)
  let progressTimer: ReturnType<typeof setInterval> | null = null

  const isSending = computed(() => state.value.status === 'sending')
  const hasStagedFile = computed(() => stagedFile.value !== null)
  const progress = computed(() => {
    if (state.value.fileSize === 0) return 0
    return Math.min(100, Math.round((state.value.bytesSent / state.value.fileSize) * 100))
  })
  const transferRate = computed(() => {
    const elapsed = state.value.elapsedTime / 1000
    if (elapsed <= 0 || state.value.bytesSent === 0) return 0
    return Math.round(state.value.bytesSent / elapsed)
  })

  const stopProgressTimer = () => {
    if (progressTimer !== null) {
      clearInterval(progressTimer)
      progressTimer = null
    }
  }

  const startProgressTimer = () => {
    stopProgressTimer()
    progressTimer = setInterval(() => {
      if (state.value.status === 'sending') {
        state.value = { ...state.value, elapsedTime: Date.now() - state.value.startTime }
      }
    }, 500)
  }

  const reset = () => {
    stopProgressTimer()
    cancelled.value = false
    stagedFile.value = null
    state.value = { ...initialState }
  }

  /**
   * 加载文件到应用中（暂存），不立即发送。
   * 用户点击发送后才真正开始传输。
   */
  const loadFile = (file: File): void => {
    stopProgressTimer()
    cancelled.value = false
    stagedFile.value = file
    state.value = {
      ...initialState,
      fileName: file.name,
      fileSize: file.size,
      status: 'loaded',
    }
  }

  const cancel = () => {
    if (state.value.status !== 'sending') return
    cancelled.value = true
    state.value = { ...state.value, status: 'cancelled' }
    stopProgressTimer()
  }

  /**
   * 将 ArrayBuffer 切分为指定大小的块，每块转换为 hex 字符串
   */
  function* chunkIterator(buffer: ArrayBuffer, chunkSize: number): Generator<{ hex: string; bytes: number }> {
    const view = new Uint8Array(buffer)
    for (let offset = 0; offset < view.length; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, view.length)
      const slice = view.subarray(offset, end)
      let hex = ''
      for (let i = 0; i < slice.length; i++) {
        hex += slice[i].toString(16).padStart(2, '0')
      }
      yield { hex, bytes: end - offset }
    }
  }

  /**
   * 开始发送已加载的文件。必须先调用 loadFile 暂存文件。
   * 允许在 loaded 或 success 状态下发送（success 表示文件已发过，可重发）。
   */
  const startSend = async (chunkSize: number = DEFAULT_CHUNK_SIZE): Promise<void> => {
    if (state.value.status !== 'loaded' && state.value.status !== 'success') return
    const file = stagedFile.value
    if (!file) return

    const transport = activeDataTransport.current
    if (!transport) {
      // 无连接时不切换到 error 状态，保持当前状态以便设备重连后重试
      state.value = { ...state.value, error: '没有可用的数据连接，请先连接设备' }
      return
    }

    cancelled.value = false
    state.value = {
      ...initialState,
      fileName: file.name,
      fileSize: file.size,
      status: 'sending',
      startTime: Date.now(),
    }

    const consoleState = useConsole(true)

    try {
      const buffer = await file.arrayBuffer()
      let chunkIndex = 0
      let totalChunks = 0

      // 先统计总块数
      for (const _ of chunkIterator(buffer, chunkSize)) {
        totalChunks++
      }
      state.value = { ...state.value, totalChunks }

      startProgressTimer()

      for (const chunk of chunkIterator(buffer, chunkSize)) {
        if (cancelled.value) {
          stopProgressTimer()
          return
        }

        try {
          await window.ipcRenderer.invoke('send-data-chunk', {
            data: chunk.hex,
            format: 'hex' as const,
            transport,
          })

          chunkIndex++
          state.value = {
            ...state.value,
            bytesSent: state.value.bytesSent + chunk.bytes,
            ackedChunks: chunkIndex,
            elapsedTime: Date.now() - state.value.startTime,
          }

          // 在控制台记录发送的块（仅记录前几块和最后一块，避免刷屏）
          if (chunkIndex <= 3 || chunkIndex === totalChunks) {
            consoleState.sendMessage(
              `[FILE] ${file.name} chunk ${chunkIndex}/${totalChunks} (${chunk.bytes} bytes)`,
              'ascii',
              false,
            )
          }
        } catch (error) {
          stopProgressTimer()
          const message = error instanceof Error ? error.message : String(error)
          state.value = {
            ...state.value,
            status: 'error',
            error: `Chunk ${chunkIndex + 1} 发送失败: ${message}`,
            elapsedTime: Date.now() - state.value.startTime,
          }
          return
        }
      }

      stopProgressTimer()
      if (!cancelled.value) {
        state.value = {
          ...state.value,
          status: 'success',
          elapsedTime: Date.now() - state.value.startTime,
        }
      }
    } catch (error) {
      stopProgressTimer()
      const message = error instanceof Error ? error.message : String(error)
      state.value = {
        ...state.value,
        status: 'error',
        error: message,
        elapsedTime: Date.now() - state.value.startTime,
      }
    }
  }

  return {
    state,
    isSending,
    hasStagedFile,
    progress,
    transferRate,
    loadFile,
    startSend,
    cancel,
    reset,
  }
}

export function useFileSend() {
  if (!globalFileSendInstance) {
    globalFileSendInstance = createFileSend()
  }
  return globalFileSendInstance
}
