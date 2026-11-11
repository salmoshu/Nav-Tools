import { computed, ref, watch } from 'vue'
import { useRtkPost } from './useRtkPost'
import { useRtkNavi } from './useRtkNavi'
import { useGnssSolverSession, type GnssSolverMode } from './useGnssSolverSession'
import { TextFileStreamService } from '@/core/file/TextFileStreamService'
import { createBrowserIpcTransport } from '@/core/platform/IpcTransport'
import { t } from '@/i18n'
import type { RtkPostRunResult } from '@/core/gnsslib/RtkPost'
import { parseRtkNaviSolutionLine, type RtkNaviStatus } from '@/core/gnsslib/RtkNavi'

function createSolver() {
  const post = useRtkPost()
  const realtime = useRtkNavi()
  const session = useGnssSolverSession()
  const saved = localStorage.getItem('nav-tools:gnsslib-solver-mode')
  const mode = ref<GnssSolverMode>(saved === 'realtime' ? 'realtime' : 'post')
  const state = ref<
    'idle' | 'running' | 'loading' | 'stopping' | 'success' | 'stopped' | 'cancelled' | 'error'
  >('idle')
  const errorText = ref('')
  const outputPath = ref('')
  const loadingProgress = ref(0)
  const startedAt = ref(0)
  const elapsedSeconds = ref(0)
  const busy = computed(
    () => state.value === 'running' || state.value === 'loading' || state.value === 'stopping',
  )
  let clock: ReturnType<typeof setInterval> | undefined
  let restoredPostRunId = ''
  let recentPostCompletion: { runId: string; result: RtkPostRunResult } | undefined
  let liveBacklog: string[] | undefined
  watch(
    busy,
    (active) => {
      if (clock) clearInterval(clock)
      if (active)
        clock = setInterval(() => {
          elapsedSeconds.value = Math.floor((Date.now() - startedAt.value) / 1000)
        }, 1000)
    },
    { flush: 'sync' },
  )

  function setMode(next: GnssSolverMode): void {
    if (busy.value || (next !== 'post' && next !== 'realtime')) return
    mode.value = next
    localStorage.setItem('nav-tools:gnsslib-solver-mode', next)
  }

  for (const channel of ['rtkpost-log', 'rtknavi-log']) {
    window.ipcRenderer?.on(channel, (_event, payload: { runId: string; chunk: string }) => {
      if (payload?.runId === session.runId.value && typeof payload.chunk === 'string')
        session.appendLog(payload.chunk, payload.runId)
    })
  }
  window.ipcRenderer?.on(
    'rtknavi-solution',
    (_event, payload: { runId: string; records?: string[] }) => {
      if (payload?.runId !== session.runId.value || session.mode.value !== 'realtime') return
      if (liveBacklog) {
        if (Array.isArray(payload.records)) liveBacklog.push(...payload.records)
        return
      }
      if (state.value !== 'running' && state.value !== 'stopping') return
      if (Array.isArray(payload.records))
        session.append(`${payload.records.join('\n')}\n`, payload.runId)
    },
  )
  watch(
    () => realtime.status.value,
    (status) => {
      if (!session.runId.value && status.state === 'running') {
        void restoreRealtime(status)
        return
      }
      if (status.runId !== session.runId.value || session.mode.value !== 'realtime') return
      outputPath.value = status.outputPath
      if (liveBacklog) return
      if (status.state === 'stopped' || status.state === 'error') {
        session.attachTimeline()
        state.value = status.state
        errorText.value = status.error ?? ''
        if (status.error) session.appendLog(`${status.error}\n`)
      }
    },
  )

  async function readOutput(path: string, id: string, completeLinesOnly = false): Promise<void> {
    const reader = new TextFileStreamService(createBrowserIpcTransport())
    let tail = ''
    await reader.read(path, {
      onChunk: (text) => {
        if (!completeLinesOnly) return session.append(text, id)
        const buffered = tail + text
        const end = Math.max(buffered.lastIndexOf('\n'), buffered.lastIndexOf('\r')) + 1
        session.append(buffered.slice(0, end), id)
        tail = buffered.slice(end)
      },
      onProgress: (value) => {
        loadingProgress.value = value
      },
    })
    // A live file can end in a partially written record; its final event supplies that record.
    if (!completeLinesOnly) session.append('\n', id)
  }

  async function completePost(result: RtkPostRunResult | null, id: string): Promise<void> {
    if (id !== session.runId.value) return
    if (!result?.ok) {
      state.value = result?.cancelled || post.status.value === 'cancelled' ? 'cancelled' : 'error'
      errorText.value = result?.error ?? post.errorText.value
      if (errorText.value) session.appendLog(`${errorText.value}\n`, id)
      session.channel.value = 'log'
      return
    }
    outputPath.value = result.outputPath
    state.value = 'loading'
    loadingProgress.value = 0
    await readOutput(result.outputPath, id)
    if (session.epochs.value === 0) throw new Error(t('gnssLib.solver.noViewData'))
    session.attachTimeline()
    state.value = 'success'
  }

  function finishRestoredPost(payload: { runId: string; result: RtkPostRunResult }): void {
    if (payload?.runId !== restoredPostRunId) return
    restoredPostRunId = ''
    post.completeTask(payload.runId, payload.result)
    void completePost(payload.result, payload.runId).catch((error) => {
      state.value = 'error'
      errorText.value = error instanceof Error ? error.message : String(error)
      session.appendLog(`${errorText.value}\n`, payload.runId)
      session.channel.value = 'log'
    })
  }
  window.ipcRenderer?.on(
    'rtkpost-finished',
    (_event, payload: { runId: string; result: RtkPostRunResult }) => {
      if (!payload?.runId || !payload.result) return
      recentPostCompletion = payload
      finishRestoredPost(payload)
    },
  )

  async function restoreRealtime(status: RtkNaviStatus): Promise<void> {
    if (session.runId.value || status.state !== 'running') return
    mode.value = 'realtime'
    session.begin(status.runId, 'realtime')
    outputPath.value = status.outputPath
    startedAt.value = Date.now()
    liveBacklog = []
    state.value = 'loading'
    try {
      if (status.outputPath) await readOutput(status.outputPath, status.runId, true)
    } catch (error) {
      // The engine may still be preparing its first output file.
      session.appendLog(`${error instanceof Error ? error.message : String(error)}\n`, status.runId)
    } finally {
      const lastTime = session.latest.value?.time ?? ''
      const records = liveBacklog ?? []
      liveBacklog = undefined
      for (const line of records) {
        const point = parseRtkNaviSolutionLine(line)
        if (point && point.time > lastTime) session.append(`${line}\n`, status.runId)
      }
      const current = realtime.status.value
      state.value =
        current.state === 'running' ? 'running' : current.state === 'error' ? 'error' : 'stopped'
      errorText.value = current.error ?? ''
      if (current.state !== 'running') session.attachTimeline()
    }
  }

  async function refresh(): Promise<void> {
    if (
      busy.value ||
      session.runId.value ||
      typeof window.electronAPI?.gnssSolverStatus !== 'function'
    )
      return
    const task = await window.electronAPI.gnssSolverStatus()
    if (!task || busy.value || session.runId.value) return
    mode.value = task.mode
    if (task.mode === 'realtime') {
      await realtime.refreshStatus()
      return
    }
    const options = post.settings.options
    session.begin(task.runId, 'post', {
      format: options.outputFormat === 'nmea' ? 'llh' : options.outputFormat,
      timeFormat: options.timeFormat,
      timeSystem: options.timeSystem,
      nmea: options.outputFormat === 'nmea',
    })
    restoredPostRunId = task.runId
    startedAt.value = Date.now()
    post.restoreTask(task.runId)
    state.value = 'running'
    // Completion can arrive between the native status snapshot and its IPC response.
    if (recentPostCompletion?.runId === task.runId) finishRestoredPost(recentPostCompletion)
  }

  async function start(): Promise<void> {
    if (busy.value || post.running.value || realtime.running.value) return
    const runId = crypto.randomUUID()
    const runMode = mode.value
    const options = post.settings.options
    session.begin(
      runId,
      runMode,
      runMode === 'post'
        ? {
            format: options.outputFormat === 'nmea' ? 'llh' : options.outputFormat,
            timeFormat: options.timeFormat,
            timeSystem: options.timeSystem,
            nmea: options.outputFormat === 'nmea',
          }
        : {},
    )
    errorText.value = ''
    outputPath.value = ''
    elapsedSeconds.value = 0
    startedAt.value = Date.now()
    state.value = 'running'
    try {
      if (runMode === 'post') {
        await post.execute(runId)
        await completePost(post.result.value, runId)
      } else {
        await realtime.start(runId)
        const status = realtime.status.value
        outputPath.value = status.outputPath
        if (status.state === 'error') throw new Error(status.error ?? t('gnssLib.rtknavi.error'))
        if (status.state === 'stopped') state.value = 'stopped'
      }
    } catch (error) {
      state.value = 'error'
      errorText.value = error instanceof Error ? error.message : String(error)
      session.appendLog(`${errorText.value}\n`, runId)
      session.channel.value = 'log'
    }
  }

  async function stop(): Promise<void> {
    if (state.value !== 'running') return
    state.value = 'stopping'
    try {
      if (mode.value === 'post') await post.cancel()
      else {
        await realtime.stop()
        state.value = 'stopped'
      }
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
      // Keep the task locked until its native exit is confirmed.
      state.value = 'running'
    }
  }

  return {
    post,
    realtime,
    session,
    mode,
    state,
    errorText,
    outputPath,
    loadingProgress,
    elapsedSeconds,
    busy,
    setMode,
    start,
    stop,
    refresh,
  }
}

let solver: ReturnType<typeof createSolver> | undefined
export function useGnssSolver() {
  return (solver ??= createSolver())
}
