// MCAP 回放播放器的全局单例状态（对齐 useFileTimeline 的模块级单例模式）。
// 所有 LiDAR 面板（场景/曲线/评分/检查/回放控制）共享同一个播放头与文档。
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { McapDocument } from '@/core/lidar/McapDocument'
import { PlayerClock } from '@/core/lidar/PlayerClock'
import { buildPlotSeries } from '@/core/lidar/LidarSeries'
import { parseDwaScores } from '@/core/lidar/DwaScores'
import {
  mcapCommonDirName,
  readMcapFromFiles,
  readMcapFromPaths,
  type LoadedMcapBytes,
} from '@/core/lidar/McapFileAccess'
import { McapRecentFiles } from '@/core/lidar/McapRecentFiles'
import { JsonStorage } from '@/core/storage/JsonStorage'
import { LIDAR_TOPICS } from '@/core/lidar/SceneFrame'
import type { CurrentFrame, CurrentMessage, DwaScores, LidarPlotSeries } from '@/core/lidar/types'

export type McapPlayerStatus = 'idle' | 'loading' | 'ready' | 'error'

const PLAYBACK_PREFS_KEY = 'nav-tools:lidar:playback-prefs'

export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8] as const

const status = ref<McapPlayerStatus>('idle')
const errorText = ref('')
const fileInfo = ref<{ name: string; path?: string; sizeBytes: number; partCount: number } | null>(null)
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

const recentStore = new McapRecentFiles(new JsonStorage(localStorage))
const prefsStorage = new JsonStorage(localStorage)

// —— 偏好持久化（速度/循环/跟随/话题可见性） ——
interface PlaybackPrefs {
  speed: number
  loop: boolean
  followRobot: boolean
  topicVisibility: Record<string, boolean>
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
    })
  }, 250)
}

loadPrefs()
watch([speed, loop, followRobot, topicVisibility], savePrefsDebounced, { deep: true })

// —— LiDAR 面板消费者计数：没有任何 LiDAR 面板挂载时，禁用全局快捷键并自动暂停 ——
let panelConsumers = 0

/** 供 LiDAR 各面板在 setup 中调用：注册一个可见消费者，卸载时自动释放。 */
export function useLidarPanelPresence(): void {
  panelConsumers++
  onUnmounted(() => {
    panelConsumers = Math.max(0, panelConsumers - 1)
    if (panelConsumers === 0) {
      clockRef.value?.pause()
      playing.value = false
    }
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

  /** 当前 /dwa_scores 的结构化解析结果（评分面板与 HUD 共用）。 */
  const currentScores = computed<DwaScores | undefined>(() => {
    const entry = currentFrame.value?.entries.get(LIDAR_TOPICS.scores)
    if (!entry) return undefined
    const text = (entry.message as { data?: unknown }).data
    return typeof text === 'string' ? parseDwaScores(text) : undefined
  })

  /** 加载一个或多个分片（板上 part_N.mcap 轮转产物），按 logTime 归并为单一文档。 */
  async function loadBytes(parts: LoadedMcapBytes[]): Promise<boolean> {
    if (parts.length === 0) return false
    status.value = 'loading'
    errorText.value = ''
    try {
      const doc = await McapDocument.load(parts.length === 1 ? parts[0].bytes : parts.map((part) => part.bytes))
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
          : (paths.length === parts.length ? mcapCommonDirName(paths) : undefined) ?? parts[0].name
      const totalBytes = parts.reduce((sum, part) => sum + part.sizeBytes, 0)
      fileInfo.value = { name: sessionName, path: paths[0], sizeBytes: totalBytes, partCount: parts.length }
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
      const parts = await readMcapFromPaths(unique)
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

  /** 逐帧步进：沿全局消息时间点前进/后退 delta 步。 */
  function stepFrames(delta: number): void {
    const doc = docRef.value
    const clock = clockRef.value
    if (!doc || !clock) return
    const times = doc.allTimesNs
    if (times.length === 0) return
    // 当前 playhead 在全局时间点中的位置
    let index = upperBound(times, clock.playheadNs) - 1
    if (delta > 0) index = Math.min(times.length - 1, index + delta)
    else index = Math.max(0, index + delta)
    seek(times[index])
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
    series,
    followRobot,
    topicVisibility,
    // 动作
    loadFromFiles,
    loadFromPath,
    loadFromPaths,
    play,
    pause,
    toggle,
    seek,
    stepFrames,
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

// —— 二分查找（与 McapDocument 内部一致） ——

function upperBound(times: ArrayLike<number>, value: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (times[mid] <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}
