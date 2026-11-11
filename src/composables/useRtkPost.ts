import { computed, reactive, ref, watch } from 'vue'
import {
  buildRtkPostArgs,
  createDefaultRtkPostSettings,
  defaultRtkPostOutputPath,
  type RtkPostLogEvent,
  type RtkPostProgress,
  type RtkPostProgressEvent,
  type RtkPostRunResult,
  type RtkPostSettings,
} from '@/core/gnsslib/RtkPost'
import { JsonStorage } from '@/core/storage/JsonStorage'
import { t } from '@/i18n'

export type RtkPostStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled'

const STORAGE_KEY = 'nav-tools:gnssraw-rtkpost-v1'
const storage = new JsonStorage(localStorage)
const settings = reactive<RtkPostSettings>(loadSettings())
const status = ref<RtkPostStatus>('idle')
const errorText = ref('')
const logText = ref('')
const result = ref<RtkPostRunResult | null>(null)
const progress = ref<RtkPostProgress | null>(null)
const running = computed(() => status.value === 'running')
let activeRunId = ''
let automaticOutputPath = ''

watch(
  settings,
  (value) => {
    storage.write(STORAGE_KEY, value)
  },
  { deep: true },
)

window.ipcRenderer?.on('rtkpost-log', (_event, payload: RtkPostLogEvent) => {
  if (payload.runId !== activeRunId || typeof payload.chunk !== 'string') return
  logText.value = (logText.value + payload.chunk).slice(-200_000)
})
window.ipcRenderer?.on('rtkpost-progress', (_event, payload: RtkPostProgressEvent) => {
  if (payload.runId !== activeRunId || !running.value) return
  progress.value = {
    phase: payload.phase,
    percentage: payload.percentage,
    processingTime: payload.processingTime ?? progress.value?.processingTime,
    processingMessage: payload.processingMessage ?? progress.value?.processingMessage,
  }
})

export function useRtkPost() {
  function restoreTask(runId: string): void {
    activeRunId = runId
    status.value = 'running'
    result.value = null
    errorText.value = ''
    logText.value = ''
    progress.value = { phase: 'preparing', percentage: null }
  }

  function completeTask(runId: string, runResult: RtkPostRunResult): void {
    if (runId !== activeRunId) return
    result.value = runResult
    logText.value = runResult.log
    status.value = runResult.cancelled ? 'cancelled' : runResult.ok ? 'success' : 'error'
    errorText.value = runResult.error ?? ''
    if (runResult.progress) progress.value = runResult.progress
    activeRunId = ''
  }
  async function execute(requestRunId?: string): Promise<void> {
    if (running.value) return
    const runId = requestRunId ?? crypto.randomUUID()
    activeRunId = runId
    status.value = 'running'
    errorText.value = ''
    logText.value = ''
    result.value = null
    progress.value = { phase: 'preparing', percentage: 0 }
    try {
      if (!settings.navPaths.some((path) => path.trim())) {
        throw new Error(t('gnssRaw.rtkpost.navRequired'))
      }
      buildRtkPostArgs(settings)
      const api = window.electronAPI?.rtkPostRun
      if (!api) throw new Error(t('gnssRaw.rtkpost.desktopOnly'))
      const runResult = await api({ ...toPlainSettings(settings), runId })
      if (activeRunId !== runId) return
      result.value = runResult
      logText.value = runResult.log
      status.value = runResult.cancelled ? 'cancelled' : runResult.ok ? 'success' : 'error'
      errorText.value = runResult.error ?? ''
      if (runResult.progress) progress.value = { ...progress.value!, ...runResult.progress }
      if (runResult.ok) {
        progress.value = { ...progress.value!, phase: 'validating', percentage: 100 }
      }
    } catch (error) {
      if (activeRunId !== runId) return
      status.value = 'error'
      errorText.value = error instanceof Error ? error.message : String(error)
      logText.value = (logText.value + `${errorText.value}\n`).slice(-200_000)
    } finally {
      if (activeRunId === runId) activeRunId = ''
    }
  }

  async function cancel(): Promise<void> {
    if (!activeRunId) return
    await window.electronAPI?.rtkPostCancel?.(activeRunId)
  }

  function suggestOutput(force = false): void {
    const next = defaultRtkPostOutputPath(settings.roverObsPath, settings.options.outputFormat)
    if (!next) return
    if (force || !settings.outputPath || settings.outputPath === automaticOutputPath) {
      settings.outputPath = next
      automaticOutputPath = next
    }
  }

  function clearResult(): void {
    result.value = null
    errorText.value = ''
    logText.value = ''
    if (!running.value) {
      status.value = 'idle'
      progress.value = null
    }
  }

  return {
    settings,
    status,
    running,
    errorText,
    logText,
    result,
    progress,
    execute,
    cancel,
    suggestOutput,
    clearResult,
    restoreTask,
    completeTask,
  }
}

function loadSettings(): RtkPostSettings {
  const defaults = createDefaultRtkPostSettings()
  const stored = storage.read<Partial<RtkPostSettings> | null>(STORAGE_KEY, null)
  if (!stored || typeof stored !== 'object') return defaults
  const storedOptions: Partial<RtkPostSettings['options']> =
    stored.options && typeof stored.options === 'object' ? stored.options : {}
  return {
    executablePath: stringValue(stored.executablePath),
    roverObsPath: stringValue(stored.roverObsPath),
    baseObsPath: stringValue(stored.baseObsPath),
    navPaths: Array.isArray(stored.navPaths)
      ? stored.navPaths.filter((item): item is string => typeof item === 'string').slice(0, 14)
      : defaults.navPaths,
    configPath: stringValue(stored.configPath),
    outputPath: stringValue(stored.outputPath),
    options: {
      ...defaults.options,
      ...storedOptions,
      constellations: Array.isArray(storedOptions.constellations)
        ? [...storedOptions.constellations]
        : [...defaults.options.constellations],
    },
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toPlainSettings(value: RtkPostSettings): RtkPostSettings {
  return {
    ...value,
    navPaths: [...value.navPaths],
    options: {
      ...value.options,
      constellations: [...value.options.constellations],
    },
  }
}
