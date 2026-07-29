import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

// Mock activeDataTransport before importing useFileSend
vi.mock('@/core/device/ActiveDataTransport', () => ({
  activeDataTransport: {
    current: 'serial' as string | undefined,
    activate: vi.fn(),
    clear: vi.fn(),
    sendChannel: vi.fn(),
  },
}))

// Mock useConsole to avoid touching the real global console state
vi.mock('@/composables/flow/useConsole', () => ({
  useConsole: () => ({
    sendMessage: vi.fn(),
  }),
}))

import { useFileSend } from '@/composables/flow/useFileSend'
import { activeDataTransport } from '@/core/device/ActiveDataTransport'
import { t } from '@/i18n'

/**
 * Create a File-like object with a working arrayBuffer() method.
 * jsdom's File does not implement arrayBuffer().
 */
function createMockFile(data: Uint8Array, name: string): File {
  const blob = new Blob([data])
  const file = new File([blob], name)
  // Polyfill arrayBuffer for jsdom
  file.arrayBuffer = async () => data.buffer.slice(0) as ArrayBuffer
  return file
}

describe('useFileSend composable', () => {
  let invokeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    invokeMock = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error -- inject a minimal ipcRenderer into the global window
    window.ipcRenderer = { invoke: invokeMock }

    // Ensure serial transport is active by default
    activeDataTransport.current = 'serial'

    // Reset the global singleton state between tests
    useFileSend().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error -- cleanup
    delete window.ipcRenderer
  })

  it('exposes initial idle state', () => {
    const { state, isSending, progress } = useFileSend()

    expect(state.value.status).toBe('idle')
    expect(state.value.bytesSent).toBe(0)
    expect(state.value.ackedChunks).toBe(0)
    expect(isSending.value).toBe(false)
    expect(progress.value).toBe(0)
  })

  // ── loadFile (staging) tests ──

  it('loadFile stages the file without sending and sets status to loaded', () => {
    const { state, isSending, hasStagedFile, loadFile } = useFileSend()

    const file = createMockFile(new Uint8Array([0x01, 0x02, 0x03, 0x04]), 'test.bin')
    loadFile(file)

    expect(state.value.status).toBe('loaded')
    expect(state.value.fileName).toBe('test.bin')
    expect(state.value.fileSize).toBe(4)
    expect(state.value.bytesSent).toBe(0)
    expect(state.value.ackedChunks).toBe(0)
    expect(isSending.value).toBe(false)
    expect(hasStagedFile.value).toBe(true)
    // No IPC call should have been made
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('loadFile replaces a previously staged file', () => {
    const { state, loadFile } = useFileSend()

    const file1 = createMockFile(new Uint8Array([0x01]), 'first.bin')
    loadFile(file1)
    expect(state.value.fileName).toBe('first.bin')

    const file2 = createMockFile(new Uint8Array([0x02, 0x03]), 'second.bin')
    loadFile(file2)
    expect(state.value.fileName).toBe('second.bin')
    expect(state.value.fileSize).toBe(2)
    expect(state.value.status).toBe('loaded')
  })

  // ── startSend tests ──

  it('startSend does nothing when status is idle (no file loaded)', async () => {
    const { state, startSend } = useFileSend()

    await startSend()

    expect(state.value.status).toBe('idle')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('sends a small file in a single chunk and reaches success state', async () => {
    const { state, progress, loadFile, startSend } = useFileSend()

    const file = createMockFile(new Uint8Array([0x01, 0x02, 0x03, 0x04]), 'test.bin')
    loadFile(file)
    await startSend()

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('send-data-chunk', {
      data: '01020304',
      format: 'hex',
      transport: 'serial',
    })
    expect(state.value.status).toBe('success')
    expect(state.value.bytesSent).toBe(4)
    expect(state.value.ackedChunks).toBe(1)
    expect(state.value.totalChunks).toBe(1)
    expect(progress.value).toBe(100)
  })

  it('splits a larger file into multiple chunks', async () => {
    const { state, loadFile, startSend } = useFileSend()

    // 3 chunks of 1024 bytes
    const content = new Uint8Array(1024 * 3)
    for (let i = 0; i < content.length; i++) content[i] = i % 256
    const file = createMockFile(content, 'large.bin')

    loadFile(file)
    await startSend(1024)

    expect(invokeMock).toHaveBeenCalledTimes(3)
    expect(state.value.status).toBe('success')
    expect(state.value.ackedChunks).toBe(3)
    expect(state.value.totalChunks).toBe(3)
    expect(state.value.bytesSent).toBe(1024 * 3)
  })

  it('tracks progress incrementally as chunks are ACKed', async () => {
    const { progress, loadFile, startSend } = useFileSend()

    const content = new Uint8Array(100)
    const file = createMockFile(content, 'progress.bin')

    // Make invoke take a tick so we can observe intermediate state
    let callCount = 0
    invokeMock.mockImplementation(async () => {
      callCount++
      await new Promise((r) => setTimeout(r, 5))
    })

    loadFile(file)
    const promise = startSend(25) // 4 chunks
    // After starting, wait a bit to let first chunk process
    await new Promise((r) => setTimeout(r, 8))

    // During sending, progress should be between 0 and 100
    expect(progress.value).toBeGreaterThanOrEqual(0)
    expect(progress.value).toBeLessThanOrEqual(100)

    await promise
    expect(progress.value).toBe(100)
    expect(callCount).toBe(4)
  })

  it('sets error state when a chunk fails', async () => {
    const { state, loadFile, startSend } = useFileSend()

    invokeMock.mockRejectedValueOnce(new Error('Serial port write failed'))

    const content = new Uint8Array(50)
    const file = createMockFile(content, 'fail.bin')

    loadFile(file)
    await startSend(25) // 2 chunks

    expect(state.value.status).toBe('error')
    expect(state.value.error).toContain('Chunk 1')
    expect(state.value.error).toContain('Serial port write failed')
    expect(state.value.ackedChunks).toBe(0)
  })

  it('cancels an in-progress transfer', async () => {
    const { state, loadFile, startSend, cancel } = useFileSend()

    // 10 chunks
    const content = new Uint8Array(100)
    const file = createMockFile(content, 'cancel.bin')

    let resolveFirst: (() => void) | undefined
    invokeMock.mockImplementation(() => {
      cancel()
      return new Promise<void>((r) => {
        resolveFirst = r
      })
    })

    loadFile(file)
    const promise = startSend(10)

    // The first chunk's invoke is still pending; resolve it so the loop
    // can proceed and check the cancelled flag
    await new Promise((r) => setTimeout(r, 5))
    resolveFirst?.()

    await promise

    expect(state.value.status).toBe('cancelled')
  })

  it('stays loaded (not error) when no transport is active, allowing retry', async () => {
    activeDataTransport.current = undefined

    const { state, loadFile, startSend } = useFileSend()

    const file = createMockFile(new Uint8Array([0x01]), 'no-transport.bin')
    loadFile(file)
    await startSend()

    // 状态保持 loaded，以便设备重连后可重试
    expect(state.value.status).toBe('loaded')
    expect(state.value.error).toBe(t('flow.noAvailableConnection'))
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('reset returns state to idle and clears staged file', async () => {
    const { state, hasStagedFile, loadFile, startSend, reset } = useFileSend()

    const file = createMockFile(new Uint8Array([0x01, 0x02]), 'reset.bin')
    loadFile(file)
    await startSend()
    expect(state.value.status).toBe('success')

    reset()
    expect(state.value.status).toBe('idle')
    expect(state.value.bytesSent).toBe(0)
    expect(hasStagedFile.value).toBe(false)
  })

  it('reset clears a loaded (not yet sent) file', () => {
    const { state, hasStagedFile, loadFile, reset } = useFileSend()

    const file = createMockFile(new Uint8Array([0x01]), 'loaded.bin')
    loadFile(file)
    expect(state.value.status).toBe('loaded')
    expect(hasStagedFile.value).toBe(true)

    reset()
    expect(state.value.status).toBe('idle')
    expect(hasStagedFile.value).toBe(false)
  })

  it('uses network transport when active', async () => {
    activeDataTransport.current = 'network'

    const { loadFile, startSend } = useFileSend()

    const file = createMockFile(new Uint8Array([0xaa, 0xbb]), 'net.bin')
    loadFile(file)
    await startSend()

    expect(invokeMock).toHaveBeenCalledWith('send-data-chunk', {
      data: 'aabb',
      format: 'hex',
      transport: 'network',
    })
  })

  it('allows resending after success (e.g. after device reconnect)', async () => {
    const { state, loadFile, startSend } = useFileSend()

    const file = createMockFile(new Uint8Array([0x01, 0x02]), 'resend.bin')
    loadFile(file)
    await startSend()

    // 第一次发送成功
    expect(state.value.status).toBe('success')
    expect(invokeMock).toHaveBeenCalledTimes(1)

    // 模拟断开重连：transport 仍然可用，直接重发
    await startSend()

    // 第二次发送也成功，状态重置后重新到达 success
    expect(state.value.status).toBe('success')
    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(state.value.bytesSent).toBe(2)
    expect(state.value.ackedChunks).toBe(1)
  })

  it('allows resending from success state even after transport was lost', async () => {
    const { state, loadFile, startSend } = useFileSend()

    const file = createMockFile(new Uint8Array([0x01]), 'reconnect.bin')
    loadFile(file)
    await startSend()
    expect(state.value.status).toBe('success')

    // 模拟设备断开
    activeDataTransport.current = undefined
    await startSend()
    // 无连接时保持 success 状态，不切换到 error
    expect(state.value.status).toBe('success')
    expect(state.value.error).toBe(t('flow.noAvailableConnection'))

    // 模拟设备重连
    activeDataTransport.current = 'serial'
    await startSend()
    // 重连后可正常重发
    expect(state.value.status).toBe('success')
    expect(state.value.error).toBeNull()
    expect(invokeMock).toHaveBeenCalledTimes(2)
  })
})

describe('useFileSend manual dismiss', () => {
  let invokeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    invokeMock = vi.fn().mockResolvedValue(undefined)
    // @ts-expect-error -- inject a minimal ipcRenderer into the global window
    window.ipcRenderer = { invoke: invokeMock }
    activeDataTransport.current = 'serial'
    useFileSend().reset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    // @ts-expect-error -- cleanup
    delete window.ipcRenderer
  })

  it('keeps success state until user manually resets', async () => {
    const { state, loadFile, startSend, reset } = useFileSend()

    const file = createMockFile(new Uint8Array([0x01, 0x02]), 'persist.bin')
    loadFile(file)
    await startSend()

    // Status stays as success even after a long time
    expect(state.value.status).toBe('success')
    vi.advanceTimersByTime(60000)
    expect(state.value.status).toBe('success')

    // Only manual reset returns to idle
    reset()
    expect(state.value.status).toBe('idle')
  })

  it('keeps error state until user manually resets', async () => {
    const { state, loadFile, startSend, reset } = useFileSend()

    invokeMock.mockRejectedValueOnce(new Error('write failed'))
    const file = createMockFile(new Uint8Array([0x01]), 'persist-err.bin')
    loadFile(file)
    await startSend()

    expect(state.value.status).toBe('error')
    vi.advanceTimersByTime(60000)
    expect(state.value.status).toBe('error')

    reset()
    expect(state.value.status).toBe('idle')
  })
})

describe('RawMessages.vue file send UI', () => {
  const source = readFileSync('src/components/windows/common/RawMessages.vue', 'utf8')

  it('imports useFileSend composable', () => {
    expect(source).toContain("import { useFileSend } from '@/composables/flow/useFileSend'")
  })

  it('renders a file load button in the input bar', () => {
    expect(source).toContain('@click="handleSelectFile"')
    expect(source).toContain(':disabled="isFileSending"')
    expect(source).toContain('加载文件')
    expect(source).toContain('文件')
  })

  it('loads file via loadFile instead of sendFile', () => {
    expect(source).toContain('loadFile(file)')
    expect(source).not.toContain('sendFile(file)')
  })

  it('keeps text send button separate from file send button', () => {
    // 文本发送按钮始终存在，只管文本
    expect(source).toContain('@click="handleSendMessage"')
    expect(source).toContain(':title="t(\'common.rawMessages.sendMessage\')"')
    // 文件发送按钮与进度面板生命周期一致，仅在 idle 时隐藏
    expect(source).toContain('@click="handleStartSend"')
    expect(source).toContain("v-if=\"fileSendState.status !== 'idle'\"")
    // loaded 和 success 状态下均可发送（支持重发）
    expect(source).toContain("fileSendState.status !== 'loaded'")
    expect(source).toContain("fileSendState.status !== 'success'")
    expect(source).toContain("t('common.rawMessages.sendFile')")
    // 不应存在统一发送入口
    expect(source).not.toContain('@click="handleSend"')
  })

  it('shows a progress panel when file send is active', () => {
    expect(source).toContain('v-if="fileSendState.status !== \'idle\'"')
    expect(source).toContain('file-send-panel')
    expect(source).toContain('el-progress')
    expect(source).toContain(':percentage="fileSendProgress"')
  })

  it('hides progress bar when file is loaded but not sent', () => {
    expect(source).toContain("v-if=\"fileSendState.status !== 'loaded'\"")
  })

  it('displays ACK status with chunk counts', () => {
    expect(source).toContain('fileSendStatusText')
    expect(source).toContain('ackedChunks')
    expect(source).toContain('totalChunks')
  })

  it('does not show loaded status text', () => {
    expect(source).not.toContain('已加载，等待发送')
  })

  it('provides a cancel button during sending', () => {
    expect(source).toContain('@click="cancelFileSend"')
    expect(source).toContain("v-if=\"fileSendState.status === 'sending'\"")
  })

  it('provides a reset/close button after completion', () => {
    expect(source).toContain('@click="resetFileSend"')
  })

  it('shows transfer rate and elapsed time', () => {
    expect(source).toContain('formatRate')
    expect(source).toContain('formatElapsed')
    expect(source).toContain('fileSendRate')
  })

  it('formats file size with B/KB/MB units', () => {
    expect(source).toContain('formatFileSize')
  })
})
