// MCAP 回放播放器的全局单例状态（对齐 useFileTimeline 的模块级单例模式）。
// 所有 LiDAR 面板（场景/曲线/评分/检查/回放控制）共享同一个播放头与文档。
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { McapDocument } from '@/core/lidar/McapDocument'
import { PlayerClock } from '@/core/lidar/PlayerClock'
import {
  PlaybackTimeline,
  availableStepModes,
  isPlaybackStepMode,
  type PlaybackStepMode,
} from '@/core/lidar/PlaybackTimeline'
import { buildPlotSeries } from '@/core/lidar/LidarSeries'
import { currentFrameScores, parsePlannerState } from '@/core/lidar/PlannerState'
import {
  expandMcapPartPaths,
  mcapCommonDirName,
  readMcapFromFiles,
  readMcapFromPaths,
  type LoadedMcapBytes,
} from '@/core/lidar/McapFileAccess'
import { RecentInputFiles } from '@/core/file/RecentInputFiles'
import { JsonStorage } from '@/core/storage/JsonStorage'
import { LIDAR_TOPICS } from '@/core/lidar/SceneFrame'
import type { CurrentFrame, CurrentMessage, DwaScores, LidarPlotSeries } from '@/core/lidar/types'

export type McapPlayerStatus = 'idle' | 'loading' | 'ready' | 'error'

const PLAYBACK_PREFS_KEY = 'nav-tools:lidar:playback-prefs'

export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8] as const

const status = ref<McapPlayerStatus>('idle')
const errorText = ref('')
const fileInfo = ref<{
  name: string
  path?: string
  /** 多分片时的全部切片路径(信息弹层逐条展示) */
  paths?: string[]
  sizeBytes: number
  partCount: number
} | null>(null)
const docRef = shallowRef<McapDocument | null>(null)
const clockRef = shallowRef<PlayerClock | null>(null)
const playheadNs = ref(0)
const playing = ref(false)
const speed = ref(1)
const loop = ref(true)
const currentFrame = shallowRef<CurrentFrame | null>(null)
const series = shallowRef<LidarPlotSeries | null>(null)
const followRobot = ref(true)
const topicVisibility = ref<Record<string, boolean>>({})
const preferredStepMode = ref<PlaybackStepMode>('planner')
const stepTimeline = computed(() =>
  docRef.value ? new PlaybackTimeline(docRef.value, preferredStepMode.value) : null,
)
const stepMode = computed(() => stepTimeline.value?.mode ?? preferredStepMode.value)
const stepModes = computed(() => (docRef.value ? availableStepModes(docRef.value) : []))
const stepTotal = computed(() => stepTimeline.value?.total ?? 0)
const stepPosition = computed(() => stepTimeline.value?.positionAt(playheadNs.value) ?? 0)
const canStepBackward = computed(
  () => stepTimeline.value?.timeForStep(playheadNs.value, -1) !== undefined,
)
const canStepForward = computed(
  () => stepTimeline.value?.timeForStep(playheadNs.value, 1) !== undefined,
)

const recentStore = new RecentInputFiles(new JsonStorage(localStorage))
const prefsStorage = new JsonStorage(localStorage)

// —— 偏好持久化（速度/循环/跟随/话题可见性/步进依据） ——
interface PlaybackPrefs {
  speed: number
  loop: boolean
  followRobot: boolean
  topicVisibility: Record<string, boolean>
  stepMode?: PlaybackStepMode
}

function isPlaybackPrefs(value: unknown): value is PlaybackPrefs {
  return typeof value === 'object' && value !== null
}

function loadPrefs(): void {
  const prefs = prefsStorage.read<PlaybackPrefs | null>(PLAYBACK_PREFS_KEY, null, isPlaybackPrefs)
  if (!prefs) return
  if (typeof prefs.speed === 'number') speed.value = prefs.speed
  if (typeof prefs.loop === 'boolean') loop.value = prefs.loop
  if (typeof prefs.followRobot === 'boolean') followRobot.value = prefs.followRobot
  if (isPlaybackStepMode(prefs.stepMode)) preferredStepMode.value = prefs.stepMode
  if (typeof prefs.topicVisibility === 'object' && prefs.topicVisibility !== null) {
    topicVisibility.value = { ...prefs.topicVisibility }
  }
}

let prefsSaveTimer: ReturnType<typeof setTimeout> | undefined
function savePrefsDebounced(): void {
  clearTimeout(prefsSaveTimer)
  prefsSaveTimer = setTimeout(() => {
    prefsStorage.write(PLAYBACK_PREFS_KEY, {
      speed: speed.value,
      loop: loop.value,
      followRobot: followRobot.value,
      topicVisibility: topicVisibility.value,
      stepMode: preferredStepMode.value,
    })
  }, 250)
}

loadPrefs()
watch([speed, loop, followRobot, topicVisibility, preferredStepMode], savePrefsDebounced, {
  deep: true,
})

// —— LiDAR 面板消费者计数：仅用于全局快捷键的作用域门控（没有任何 LiDAR 面板
// 挂载时快捷键不响应）。播放本身不随面板/应用切换暂停——切走再切回时动画继续。
let panelConsumers = 0

/** 供 LiDAR 各面板在 setup 中调用：注册一个可见消费者，卸载时自动释放。 */
export function useLidarPanelPresence(): void {
  panelConsumers++
  onUnmounted(() => {
    panelConsumers = Math.max(0, panelConsumers - 1)
  })
}

// —— 回放主循环（requestAnimationFrame 驱动） ——

let rafId = 0
let lastTs = 0

function tickLoop(ts: number): void {
  rafId = 0
  const clock = clockRef.value
  if (!clock || !clock.playing) {
    playing.value = false
    return
  }
  const dtMs = lastTs === 0 ? 0 : ts - lastTs
  lastTs = ts
  const result = clock.tick(Math.min(dtMs, 250))
  playheadNs.value = clock.playheadNs
  rebuildFrame()
  if (result.endReached && !clock.loop) {
    playing.value = false
    return
  }
  rafId = requestAnimationFrame(tickLoop)
}

function ensureLoopRunning(): void {
  if (rafId === 0 && clockRef.value?.playing) {
    lastTs = 0
    rafId = requestAnimationFrame(tickLoop)
  }
}

function rebuildFrame(): void {
  const doc = docRef.value
  if (!doc) return
  const entries = new Map<string, CurrentMessage>()
  for (const topic of doc.topicNames()) {
    const message = doc.decodeAtOrBefore(topic, playheadNs.value)
    if (message) entries.set(topic, message)
  }
  currentFrame.value = { timeNs: playheadNs.value, entries }
}

// —— 对外面板动作 ——

export function useMcapPlayer() {
  function currentEntry(topic: string) {
    return currentFrame.value?.entries.get(topic)
  }

  const currentPlannerState = computed(() =>
    parsePlannerState(currentFrame.value?.entries.get(LIDAR_TOPICS.plannerState)?.message),
  )

  /** Scores from an older successful frame must never replace a current hold/failure. */
  const currentScores = computed<DwaScores | undefined>(() => {
    const frame = currentFrame.value
    return frame
      ? currentFrameScores(frame, docRef.value?.topicInfo(LIDAR_TOPICS.plannerState) !== undefined)
      : undefined
  })

  /** 加载一个或多个分片（板上 part_N.mcap 轮转产物），按 logTime 归并为单一文档。 */
  async function loadBytes(parts: LoadedMcapBytes[]): Promise<boolean> {
    if (parts.length === 0) return false
    status.value = 'loading'
    errorText.value = ''
    try {
      const doc = await McapDocument.load(
        parts.length === 1 ? parts[0].bytes : parts.map((part) => part.bytes),
      )
      docRef.value = doc
      series.value = buildPlotSeries(doc)
      const clock = new PlayerClock(doc.startNs ?? 0, doc.endNs ?? 0)
      clock.setSpeed(speed.value)
      clock.setLoop(loop.value)
      clockRef.value = clock
      clock.seek(doc.startNs ?? 0)
      playheadNs.value = clock.playheadNs
      const paths = parts.map((part) => part.path).filter((path): path is string => !!path)
      const sessionName =
        parts.length === 1
          ? parts[0].name
          : ((paths.length === parts.length ? mcapCommonDirName(paths) : undefined) ??
            parts[0].name)
      const totalBytes = parts.reduce((sum, part) => sum + part.sizeBytes, 0)
      fileInfo.value = {
        name: sessionName,
        path: paths[0],
        paths: paths.length > 1 ? paths : undefined,
        sizeBytes: totalBytes,
        partCount: parts.length,
      }
      rebuildFrame()
      status.value = 'ready'
      if (paths.length > 0) {
        recentStore.record({
          path: paths[0],
          name: sessionName,
          sizeBytes: totalBytes,
          paths: paths.length > 1 ? paths : undefined,
        })
      }
      return true
    } catch (error) {
      status.value = 'error'
      errorText.value = String(error)
      docRef.value = null
      currentFrame.value = null
      series.value = null
      fileInfo.value = null
      return false
    }
  }

  async function loadFromFiles(files: File[]): Promise<boolean> {
    if (status.value === 'loading') return false
    const seen = new Set<string>()
    const unique = files.filter((file) => {
      const key = `${file.name}:${file.size}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (unique.length === 0) return false
    // 只拖入/选中一个分片时: 能拿到磁盘路径就自动展开同族分片, 加载整段录像
    if (unique.length === 1) {
      const path = window.electronAPI?.getPathForFile?.(unique[0])
      if (path) {
        const family = await expandMcapPartPaths([path])
        if (family.length > 1) return loadFromPaths(family)
      }
    }
    const parts = await readMcapFromFiles(unique)
    return loadBytes(parts)
  }

  async function loadFromPath(path: string): Promise<boolean> {
    return loadFromPaths([path])
  }

  async function loadFromPaths(paths: string[]): Promise<boolean> {
    if (status.value === 'loading') return false
    const unique = [...new Set(paths)]
    if (unique.length === 0) return false
    try {
      // 手动导入单个分片(路径输入/单选/最近文件重开)时自动补齐同族分片
      const parts = await readMcapFromPaths(await expandMcapPartPaths(unique))
      return await loadBytes(parts)
    } catch (error) {
      status.value = 'error'
      errorText.value = String(error)
      return false
    }
  }

  function play(): void {
    clockRef.value?.play()
    playing.value = clockRef.value?.playing ?? false
    ensureLoopRunning()
  }

  function pause(): void {
    clockRef.value?.pause()
    playing.value = false
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  function toggle(): void {
    if (playing.value) pause()
    else play()
  }

  function seek(timeNs: number): void {
    const clock = clockRef.value
    if (!clock) return
    clock.seek(timeNs)
    playheadNs.value = clock.playheadNs
    rebuildFrame()
  }

  /** 按选定的数据流步进；连续播放和时间轴仍使用真实时间。 */
  function stepFrames(delta: number): void {
    const clock = clockRef.value
    if (!clock) return
    const time = stepTimeline.value?.timeForStep(clock.playheadNs, delta)
    pause()
    if (time === undefined) return
    seek(time)
  }

  function setStepMode(mode: PlaybackStepMode): void {
    if (isPlaybackStepMode(mode)) preferredStepMode.value = mode
  }

  function setSpeed(value: number): void {
    speed.value = value
    clockRef.value?.setSpeed(value)
  }

  function setLoop(value: boolean): void {
    loop.value = value
    clockRef.value?.setLoop(value)
  }

  function setTopicVisible(topic: string, visible: boolean): void {
    topicVisibility.value = { ...topicVisibility.value, [topic]: visible }
  }

  function isTopicVisible(topic: string): boolean {
    return topicVisibility.value[topic] !== false
  }

  return {
    // 状态
    status,
    errorText,
    fileInfo,
    document: docRef,
    playheadNs,
    playing,
    speed,
    loop,
    currentFrame,
    currentScores,
    currentPlannerState,
    series,
    followRobot,
    topicVisibility,
    stepMode,
    stepModes,
    stepPosition,
    stepTotal,
    canStepBackward,
    canStepForward,
    // 动作
    loadFromFiles,
    loadFromPath,
    loadFromPaths,
    play,
    pause,
    toggle,
    seek,
    stepFrames,
    setStepMode,
    setSpeed,
    setLoop,
    setTopicVisible,
    isTopicVisible,
    currentEntry,
  }
}

export type McapPlayer = ReturnType<typeof useMcapPlayer>

// —— 全局键盘快捷键（空格/方向键），仅在有文档且至少一个 LiDAR 面板挂载时生效 ——
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  ) {
    return true
  }
  // Element Plus 交互控件自身的方向键/空格语义优先（滑块、步进器、按钮等）
  return target.closest('.el-slider, [role="slider"], .el-input-number, .el-button') !== null
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (event) => {
      if (panelConsumers === 0) return
      if (isEditableTarget(event.target)) return
      const player = useMcapPlayer()
      if (player.status.value !== 'ready') return
      switch (event.key) {
        case ' ':
          event.preventDefault()
          player.toggle()
          break
        case 'ArrowLeft':
          event.preventDefault()
          player.stepFrames(event.shiftKey ? -10 : -1)
          break
        case 'ArrowRight':
          event.preventDefault()
          player.stepFrames(event.shiftKey ? 10 : 1)
          break
        case 'Home':
          event.preventDefault()
          player.seek(player.document.value?.startNs ?? 0)
          break
        case 'End':
          event.preventDefault()
          player.seek(player.document.value?.endNs ?? 0)
          break
      }
    },
    { capture: true },
  )
}
