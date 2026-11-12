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
import { parseRtkPostConfig } from '@/core/gnsslib/RtkPostConfig'
import { JsonStorage } from '@/core/storage/JsonStorage'
import { t } from '@/i18n'
import {
  formatRtkPostTime,
  intersectObservationSpans,
  parseCalendarTime,
  type RtkPostTimeSpan,
} from '@/core/gnsslib/RtkPostProgress'

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
const observationSpan = ref<RtkPostTimeSpan | null>(null)
const roverObservationSpan = ref<RtkPostTimeSpan | null>(null)
const baseObservationSpan = ref<RtkPostTimeSpan | null>(null)
const observationStatus = ref<'idle' | 'loading' | 'ready' | 'no-overlap' | 'unavailable'>('idle')
const observationError = ref('')
let observationRevision = 0
let initializedObservationSource = false
const observationRefresh = ref(0)
const configStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const configDetail = ref('')
let configContent: string | undefined

watch(
  () =>
    [
      settings.roverObsPath.trim(),
      settings.options.mode >= 1 && settings.options.mode <= 6 ? settings.baseObsPath.trim() : '',
      observationRefresh.value,
    ] as const,
  ([roverPath, basePath], previous, onCleanup) => {
    const revision = ++observationRevision
    if (
      initializedObservationSource &&
      (previous?.[0] !== roverPath || previous?.[1] !== basePath)
    ) {
      settings.options.startTime = ''
      settings.options.endTime = ''
    }
    initializedObservationSource = true
    observationSpan.value = null
    roverObservationSpan.value = null
    baseObservationSpan.value = null
    observationError.value = ''
    void window.electronAPI?.rtkPostCancelObservationRead?.().catch(() => undefined)
    if (!roverPath) {
      observationStatus.value = 'idle'
      return
    }
    const read = window.electronAPI?.rtkPostObservationSpans
    if (typeof read !== 'function') {
      observationStatus.value = 'unavailable'
      return
    }
    observationStatus.value = 'loading'
    const timer = setTimeout(() => {
      void read({ roverPath, ...(basePath ? { basePath } : {}) })
        .then((spans) => {
          if (revision !== observationRevision) return
          const valid = (span: RtkPostTimeSpan | null | undefined): span is RtkPostTimeSpan =>
            !!span &&
            Number.isFinite(span.start) &&
            Number.isFinite(span.end) &&
            span.end > span.start
          if (!valid(spans?.rover) || (basePath && !valid(spans?.base))) {
            observationStatus.value = 'unavailable'
            return
          }
          roverObservationSpan.value = spans.rover
          baseObservationSpan.value = valid(spans.base) && basePath ? spans.base : null
          const common = intersectObservationSpans(spans.rover, baseObservationSpan.value)
          observationSpan.value = common ?? null
          observationStatus.value = common ? 'ready' : 'no-overlap'
        })
        .catch((error: unknown) => {
          if (revision !== observationRevision) return
          observationError.value = error instanceof Error ? error.message : String(error)
          observationStatus.value = 'unavailable'
        })
    }, 250)
    onCleanup(() => clearTimeout(timer))
  },
  { immediate: true, flush: 'sync' },
)

const timeSelectionError = computed(() => {
  if (observationStatus.value === 'no-overlap') return t('gnssRaw.rtkpost.timeNoOverlap')
  const span = observationSpan.value
  if (!span) return ''
  const startText = settings.options.startTime.trim()
  const endText = settings.options.endTime.trim()
  const start = startText ? parseCalendarTime(startText) : span.start
  const end = endText ? parseCalendarTime(endText) : span.end
  if (start === undefined || end === undefined) return t('gnssRaw.rtkpost.timeSelectionInvalid')
  if (start >= end) return t('gnssRaw.rtkpost.timeSelectionOrder')
  if (start < span.start - 1 || end > span.end + 1) return t('gnssRaw.rtkpost.timeSelectionOutside')
  return ''
})
const timeRangeBlocked = computed(
  () => observationStatus.value === 'loading' || !!timeSelectionError.value,
)

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
      if (observationStatus.value === 'loading') throw new Error(t('gnssRaw.rtkpost.timeLoading'))
      if (timeSelectionError.value) throw new Error(timeSelectionError.value)
      if (!settings.navPaths.some((path) => path.trim())) {
        throw new Error(t('gnssRaw.rtkpost.navRequired'))
      }
      const requestSettings = toPlainSettings(settings)
      if (observationSpan.value) {
        if (!requestSettings.options.startTime.trim())
          requestSettings.options.startTime = formatRtkPostTime(observationSpan.value.start)
        if (!requestSettings.options.endTime.trim())
          requestSettings.options.endTime = formatRtkPostTime(observationSpan.value.end)
      }
      buildRtkPostArgs(requestSettings)
      const api = window.electronAPI?.rtkPostRun
      if (!api) throw new Error(t('gnssRaw.rtkpost.desktopOnly'))
      const runResult = await api({
        ...requestSettings,
        runId,
        ...(configContent !== undefined ? { configContent } : {}),
      })
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

  async function loadConfig(path = settings.configPath): Promise<boolean> {
    const nextPath = path.trim()
    configContent = undefined
    if (!nextPath) {
      settings.configPath = ''
      configStatus.value = 'idle'
      configDetail.value = ''
      return true
    }
    const api = window.electronAPI?.rtkPostReadConfig
    if (typeof api !== 'function') {
      configStatus.value = 'error'
      configDetail.value = t('gnssRaw.rtkpost.desktopOnly')
      return false
    }
    configStatus.value = 'loading'
    configDetail.value = ''
    try {
      const content = await api(nextPath)
      const parsed = parseRtkPostConfig(content)
      if (parsed.recognizedKeys.length === 0) {
        throw new Error(t('gnssRaw.rtkpost.configEmpty'))
      }
      Object.assign(settings.options, parsed.options)
      settings.configPath = nextPath
      configContent = content
      configStatus.value = 'ready'
      configDetail.value = t('gnssRaw.rtkpost.configLoaded', {
        count: parsed.recognizedKeys.length,
      })
      return true
    } catch (error) {
      configStatus.value = 'error'
      configDetail.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  function refreshObservationSpan(): void {
    observationRefresh.value++
  }

  return {
    settings,
    status,
    running,
    errorText,
    logText,
    result,
    progress,
    configStatus,
    configDetail,
    observationSpan,
    roverObservationSpan,
    baseObservationSpan,
    observationStatus,
    observationError,
    timeSelectionError,
    timeRangeBlocked,
    loadConfig,
    refreshObservationSpan,
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
