import { computed, reactive, ref, watch } from 'vue'
import {
  buildRtkNaviConfig,
  createDefaultRtkNaviSettings,
  type RtkNaviLogEvent,
  type RtkNaviSettings,
  type RtkNaviSolution,
  type RtkNaviSolutionEvent,
  type RtkNaviStatus,
} from '@/core/gnsslib/RtkNavi'
import { JsonStorage } from '@/core/storage/JsonStorage'
import { t } from '@/i18n'
import { parseRtkPostConfig } from '@/core/gnsslib/RtkPostConfig'
import {
  createDefaultRtkNaviAdvancedOptions,
  RTKNAVI_ADVANCED_CONFIG,
  type RtkNaviAdvancedKey,
} from '@/core/gnsslib/RtkNaviAdvancedOptions'
import type { SolverOptionKey, SolverOptionValue } from '@/core/gnsslib/GnssSolverOptions'

const STORAGE_KEY = 'nav-tools:gnsslib-rtknavi-v1'
const storage = new JsonStorage(localStorage)
const settings = reactive<RtkNaviSettings>(loadSettings())
const status = ref<RtkNaviStatus>({ runId: '', state: 'idle', outputPath: '' })
const latestSolution = ref<RtkNaviSolution | null>(null)
const solutions = ref<RtkNaviSolution[]>([])
const epochs = ref(0)
const qualityCounts = ref<Record<number, number>>({})
const logText = ref('')
const errorText = ref('')
const configStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const configDetail = ref('')
let configRevision = 0
let pendingConfigRead: { path: string; promise: Promise<boolean> } | undefined
const running = computed(
  () => status.value.state === 'running' || status.value.state === 'stopping',
)
let activeRunId = ''
let startRevision = 0

watch(settings, (value) => storage.write(STORAGE_KEY, value), { deep: true })

window.ipcRenderer?.on('rtknavi-status', (_event, payload: RtkNaviStatus) => {
  if (activeRunId && payload.runId !== activeRunId) return
  status.value = payload
  errorText.value = payload.error ?? ''
  if (payload.state === 'stopped' || payload.state === 'error') activeRunId = ''
})
window.ipcRenderer?.on('rtknavi-solution', (_event, payload: RtkNaviSolutionEvent) => {
  if (payload.runId !== activeRunId) return
  latestSolution.value = payload.solution
  solutions.value = [...solutions.value.slice(-999), payload.solution]
  epochs.value = payload.epochs
  qualityCounts.value = payload.qualityCounts
})
window.ipcRenderer?.on('rtknavi-log', (_event, payload: RtkNaviLogEvent) => {
  if (payload.runId !== activeRunId || typeof payload.chunk !== 'string') return
  logText.value = (logText.value + payload.chunk).slice(-200_000)
})

export function useRtkNavi() {
  function loadBaseConfig(): Promise<boolean> {
    const path = settings.options.baseConfigPath.trim()
    if (pendingConfigRead?.path === path) return pendingConfigRead.promise
    const revision = ++configRevision
    const promise = readBaseConfig(path, revision)
    pendingConfigRead = { path, promise }
    void promise.then(() => {
      if (pendingConfigRead?.promise === promise) pendingConfigRead = undefined
    })
    return promise
  }

  async function readBaseConfig(path: string, revision: number): Promise<boolean> {
    if (!path) {
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
      const content = await api(path)
      if (typeof content !== 'string') throw new Error(t('gnssLib.rtknavi.configReadError'))
      if (revision !== configRevision || settings.options.baseConfigPath.trim() !== path)
        return false
      const parsed = parseRtkPostConfig(content)
      const defaults = createDefaultRtkNaviAdvancedOptions()
      const overrides = new Set(settings.advancedOptionOverrides)
      for (const { key } of RTKNAVI_ADVANCED_CONFIG) {
        if (overrides.has(key)) continue
        Object.assign(settings.options, { [key]: parsed.options[key] ?? defaults[key] })
      }
      configStatus.value = 'ready'
      configDetail.value = t('gnssLib.rtknavi.configLoaded')
      return true
    } catch (error) {
      if (revision !== configRevision || settings.options.baseConfigPath.trim() !== path)
        return false
      configStatus.value = 'error'
      configDetail.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  function updateOption(key: SolverOptionKey, value: SolverOptionValue): void {
    Object.assign(settings.options, { [key]: value })
    if (RTKNAVI_ADVANCED_CONFIG.some((entry) => entry.key === key)) {
      const advancedKey = key as RtkNaviAdvancedKey
      if (!settings.advancedOptionOverrides.includes(advancedKey))
        settings.advancedOptionOverrides.push(advancedKey)
    }
  }

  async function restoreBaseConfig(): Promise<void> {
    const previous = [...settings.advancedOptionOverrides]
    settings.advancedOptionOverrides = []
    if (!(await loadBaseConfig())) settings.advancedOptionOverrides = previous
  }

  async function start(requestRunId?: string): Promise<void> {
    if (running.value) return
    const revision = ++startRevision
    if (settings.options.baseConfigPath.trim()) {
      const loaded = await loadBaseConfig()
      if (revision !== startRevision) return
      if (!loaded) throw new Error(configDetail.value || t('gnssLib.rtknavi.configReadError'))
    }
    buildRtkNaviConfig(settings, settings.outputPath || 'rtknavi-current.pos')
    const api = window.electronAPI?.rtkNaviStart
    if (!api) throw new Error('RTKNAVI 仅可在 Electron 桌面端运行')
    const runId = requestRunId ?? crypto.randomUUID()
    activeRunId = runId
    latestSolution.value = null
    solutions.value = []
    epochs.value = 0
    qualityCounts.value = {}
    logText.value = ''
    errorText.value = ''
    status.value = { runId, state: 'running', outputPath: settings.outputPath }
    try {
      const result = await api({ ...toPlainSettings(settings), runId })
      if (activeRunId === runId) status.value = result
    } catch (error) {
      if (activeRunId !== runId) return
      activeRunId = ''
      const message = error instanceof Error ? error.message : String(error)
      status.value = { runId, state: 'error', outputPath: settings.outputPath, error: message }
      errorText.value = message
    }
  }

  async function stop(): Promise<void> {
    startRevision++
    if (!activeRunId) return
    const runId = activeRunId
    const result = await window.electronAPI?.rtkNaviStop?.(runId)
    if (result) status.value = result
    if (activeRunId === runId) activeRunId = ''
  }

  async function refreshStatus(): Promise<void> {
    const api = window.electronAPI?.rtkNaviStatus
    if (!api) return
    const result = await api()
    status.value = result
    if (result.state === 'running' || result.state === 'stopping') activeRunId = result.runId
  }

  function clearMonitor(): void {
    latestSolution.value = null
    solutions.value = []
    epochs.value = 0
    qualityCounts.value = {}
    logText.value = ''
    errorText.value = ''
  }

  return {
    settings,
    status,
    running,
    latestSolution,
    solutions,
    epochs,
    qualityCounts,
    logText,
    errorText,
    configStatus,
    configDetail,
    loadBaseConfig,
    restoreBaseConfig,
    updateOption,
    start,
    stop,
    refreshStatus,
    clearMonitor,
  }
}

function loadSettings(): RtkNaviSettings {
  const defaults = createDefaultRtkNaviSettings()
  const stored = storage.read<Partial<RtkNaviSettings> | null>(STORAGE_KEY, null)
  if (!stored || typeof stored !== 'object') return defaults
  const storedOptions: Partial<RtkNaviSettings['options']> =
    stored.options && typeof stored.options === 'object' ? stored.options : {}
  return {
    executablePath: typeof stored.executablePath === 'string' ? stored.executablePath : '',
    outputPath: typeof stored.outputPath === 'string' ? stored.outputPath : '',
    advancedOptionOverrides: Array.isArray(stored.advancedOptionOverrides)
      ? stored.advancedOptionOverrides.filter((key): key is RtkNaviAdvancedKey =>
          RTKNAVI_ADVANCED_CONFIG.some((entry) => entry.key === key),
        )
      : [],
    inputs: defaults.inputs.map((input, index) => ({
      ...input,
      ...(Array.isArray(stored.inputs) ? stored.inputs[index] : undefined),
    })),
    options: {
      ...defaults.options,
      ...storedOptions,
      constellations: Array.isArray(storedOptions.constellations)
        ? [...storedOptions.constellations]
        : [...defaults.options.constellations],
    },
  }
}

function toPlainSettings(value: RtkNaviSettings): RtkNaviSettings {
  return {
    ...value,
    advancedOptionOverrides: [...value.advancedOptionOverrides],
    inputs: value.inputs.map((stream) => ({ ...stream })),
    options: {
      ...value.options,
      constellations: [...value.options.constellations],
    },
  }
}
