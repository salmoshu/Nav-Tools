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
import { mergeRtkPostConfig, parseRtkPostConfig } from '@/core/gnsslib/RtkPostConfig'
import {
  copyPostOptions,
  equalPostOption,
  restorePostManualBaselines,
  updatePostOptionDraft,
  type EditablePostKey,
  type PostManualBaselines,
} from '@/core/gnsslib/RtkPostOptionDraft'
import type { SolverOptionKey, SolverOptionValue } from '@/core/gnsslib/GnssSolverOptions'
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
const MANUAL_MARKERS_KEY = 'nav-tools:gnssraw-rtkpost-manual-v1'
const storage = new JsonStorage(localStorage)
const settings = reactive<RtkPostSettings>(loadSettings())
const draftOptions = reactive(copyPostOptions(settings.options))
const draftConfigPath = ref(settings.configPath)
const committedManualBaselines = ref<PostManualBaselines>(
  restorePostManualBaselines(storage.read<unknown>(MANUAL_MARKERS_KEY, {}), settings.options),
)
const draftManualBaselines = reactive<PostManualBaselines>({ ...committedManualBaselines.value })
const manualModifiedKeys = computed(() => Object.keys(draftManualBaselines) as EditablePostKey[])
const hasPendingOptions = computed(() => {
  if (draftConfigPath.value.trim() !== settings.configPath.trim()) return true
  for (const key of Object.keys(settings.options) as Array<keyof RtkPostSettings['options']>) {
    if (!equalPostOption(draftOptions[key], settings.options[key])) return true
  }
  const keys = new Set([
    ...Object.keys(draftManualBaselines),
    ...Object.keys(committedManualBaselines.value),
  ])
  return [...keys].some(
    (key) =>
      !equalPostOption(
        draftManualBaselines[key as EditablePostKey],
        committedManualBaselines.value[key as EditablePostKey],
      ),
  )
})
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
const configSaving = ref(false)
let configContent: string | undefined
let draftConfigContent: string | undefined
let loadedDraftPath = settings.configPath.trim()
let configRevision = 0

/** Any form edit invalidates a handoff return context, including uncommitted option edits. */
const formRevision = ref(0)
const handoffInputState = ref<{
  missingRover: boolean
  missingNavigation: boolean
  baseOnly: boolean
} | null>(null)
const handoffNotice = computed(() => {
  const state = handoffInputState.value
  if (!state) return ''
  const missingRover = !settings.roverObsPath.trim()
  const missingNavigation = !settings.navPaths.some((path) => path.trim())
  if (missingRover && missingNavigation) return t('gnssLib.solver.handoffNeedRoverNav')
  if (missingRover) return t('gnssLib.solver.handoffNeedRover')
  if (missingNavigation) return t('gnssLib.solver.handoffNeedNav')
  return t('gnssLib.solver.handoffInputsReady')
})
watch(settings, () => formRevision.value++, { deep: true, flush: 'sync' })
watch(draftOptions, () => formRevision.value++, { deep: true, flush: 'sync' })
watch(draftManualBaselines, () => formRevision.value++, { deep: true, flush: 'sync' })
watch(draftConfigPath, () => formRevision.value++, { flush: 'sync' })

// The time range is edited in Inputs, outside the options draft.
watch(
  () => [settings.options.startTime, settings.options.endTime] as const,
  ([start, end]) => {
    draftOptions.startTime = start
    draftOptions.endTime = end
  },
  { flush: 'sync' },
)

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
    if (hasPendingOptions.value || configSaving.value || configStatus.value === 'loading') {
      throw new Error(t('gnssRaw.rtkpost.optionsPending'))
    }
    const runId = requestRunId ?? crypto.randomUUID()
    handoffInputState.value = null
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

  async function loadConfig(path = draftConfigPath.value): Promise<boolean> {
    const nextPath = path.trim()
    const revision = ++configRevision
    if (!nextPath) {
      draftConfigPath.value = ''
      loadedDraftPath = ''
      draftConfigContent = undefined
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
      if (revision !== configRevision || draftConfigPath.value.trim() !== nextPath) return false
      if (typeof content !== 'string') throw new Error(t('gnssRaw.rtkpost.configEmpty'))
      const parsed = parseRtkPostConfig(content)
      if (parsed.recognizedKeys.length === 0) {
        throw new Error(t('gnssRaw.rtkpost.configEmpty'))
      }
      Object.assign(draftOptions, parsed.options)
      for (const key of Object.keys(parsed.options))
        delete draftManualBaselines[key as EditablePostKey]
      draftConfigPath.value = nextPath
      loadedDraftPath = nextPath
      draftConfigContent = content
      configStatus.value = 'ready'
      configDetail.value = t('gnssRaw.rtkpost.configLoaded', {
        count: parsed.recognizedKeys.length,
      })
      return true
    } catch (error) {
      if (revision !== configRevision || draftConfigPath.value.trim() !== nextPath) return false
      configStatus.value = 'error'
      configDetail.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  function updateOption(key: SolverOptionKey, value: SolverOptionValue): void {
    if (value === undefined) return
    updatePostOptionDraft(
      draftOptions,
      draftManualBaselines,
      key as EditablePostKey,
      value as RtkPostSettings['options'][EditablePostKey],
    )
  }

  function confirmOptions(): void {
    if (configSaving.value || configStatus.value === 'loading') return
    if (draftConfigPath.value.trim() !== loadedDraftPath || configStatus.value === 'error') {
      throw new Error(t('gnssRaw.rtkpost.configMustLoad'))
    }
    const snapshot = copyPostOptions(draftOptions)
    // Changing the positioning mode can reset the observation range synchronously.
    Object.assign(settings.options, snapshot)
    settings.configPath = draftConfigPath.value.trim()
    configContent = draftConfigContent
    committedManualBaselines.value = restorePostManualBaselines(draftManualBaselines, snapshot)
    storage.write(MANUAL_MARKERS_KEY, committedManualBaselines.value)
    storage.write(STORAGE_KEY, settings)
    Object.assign(draftOptions, copyPostOptions(settings.options))
  }

  function cancelOptions(): void {
    ++configRevision
    Object.assign(draftOptions, copyPostOptions(settings.options))
    for (const key of Object.keys(draftManualBaselines))
      delete draftManualBaselines[key as EditablePostKey]
    Object.assign(draftManualBaselines, committedManualBaselines.value)
    draftConfigPath.value = settings.configPath
    loadedDraftPath = settings.configPath.trim()
    draftConfigContent = configContent
    configStatus.value = 'idle'
    configDetail.value = ''
  }

  async function saveOptions(): Promise<boolean> {
    if (configSaving.value || configStatus.value === 'loading') return false
    if (draftConfigPath.value.trim() !== loadedDraftPath || configStatus.value === 'error') {
      throw new Error(t('gnssRaw.rtkpost.configMustLoad'))
    }
    const read = window.electronAPI?.rtkPostReadConfig
    const save = window.electronAPI?.rtkPostSaveConfig
    if (!save || (draftConfigPath.value.trim() && !read)) {
      throw new Error(t('gnssRaw.rtkpost.desktopOnly'))
    }
    configSaving.value = true
    try {
      const source = draftConfigPath.value.trim() ? await read!(draftConfigPath.value.trim()) : ''
      if (typeof source !== 'string') throw new Error(t('gnssRaw.rtkpost.configEmpty'))
      const content = mergeRtkPostConfig(source, copyPostOptions(draftOptions))
      const filePath = await save({
        defaultPath: draftConfigPath.value.trim() || 'rtkpost.conf',
        content,
        protectedPaths: [
          settings.executablePath,
          settings.roverObsPath,
          settings.baseObsPath,
          settings.outputPath,
          ...settings.navPaths,
        ].filter((item) => item.trim()),
      })
      if (!filePath) return false
      draftConfigPath.value = filePath
      loadedDraftPath = filePath.trim()
      draftConfigContent = content
      for (const key of Object.keys(draftManualBaselines))
        delete draftManualBaselines[key as EditablePostKey]
      configSaving.value = false
      confirmOptions()
      configStatus.value = 'ready'
      configDetail.value = t('gnssRaw.rtkpost.configSaved')
      return true
    } finally {
      configSaving.value = false
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
    configSaving,
    draftOptions,
    draftConfigPath,
    manualModifiedKeys,
    hasPendingOptions,
    observationSpan,
    roverObservationSpan,
    baseObservationSpan,
    observationStatus,
    observationError,
    timeSelectionError,
    timeRangeBlocked,
    formRevision,
    handoffNotice,
    loadConfig,
    updateOption,
    confirmOptions,
    cancelOptions,
    saveOptions,
    refreshObservationSpan,
    execute,
    cancel,
    suggestOutput,
    clearResult,
    loadRinexInput(
      files: import('@/core/handoff/AppHandoff').AppHandoffFile[],
    ): void {
      if (running.value) throw new Error('HANDOFF_SOLVER_BUSY')
      const rover = files.find(
        (file) => file.role === 'rover-observation' && file.format === 'rinex',
      )
      const base = files.find(
        (file) => file.role === 'base-observation' && file.format === 'rinex',
      )
      if (!rover && !base) throw new Error('HANDOFF_OBSERVATION_FILE_MISSING')
      const navigation = files.filter(
        (file) => file.role === 'navigation' && file.format === 'rinex',
      )
      settings.roverObsPath = rover?.path ?? ''
      settings.baseObsPath = base?.path ?? ''
      settings.navPaths = navigation.length > 0 ? navigation.map((file) => file.path) : ['']
      settings.outputPath = ''
      settings.options.startTime = ''
      settings.options.endTime = ''
      automaticOutputPath = ''
      clearResult()
      handoffInputState.value = {
        missingRover: !rover,
        missingNavigation: navigation.length === 0,
        baseOnly: !rover && !!base,
      }
    },
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
