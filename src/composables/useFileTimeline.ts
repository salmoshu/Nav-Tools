import { computed, ref } from 'vue'
import { recordingClockDifference } from '@/core/gnss/EpochSelection'

export type FileTimelineMode = 'loaded' | 'replay'

/**
 * 时间轴数据源的结构化契约：NumericEpochStore（GNSS 墙上时钟）与
 * TextEpochStore（文本样本时钟）都天然满足。
 */
export interface EpochTimelineSource {
  readonly length: number
  readonly duration: number
  getElapsedTime(index: number): number
  findNearestElapsedTime(elapsedMilliseconds: number): number
  formatTime(index: number): string
  getTimestamp?(index: number): number
}

interface TimelineOptions {
  mode: FileTimelineMode
  speed: number
  startElapsedMilliseconds?: number
  applyEpoch(index: number): void
}

export function createFileTimeline() {
  const active = ref(false)
  const indexing = ref(false)
  const indexingProgress = ref(0)
  const mode = ref<FileTimelineMode>('loaded')
  const playing = ref(false)
  const dragging = ref(false)
  const cursorIndex = ref(0)
  const totalEpochs = ref(0)
  const elapsedMilliseconds = ref(0)
  const durationMilliseconds = ref(0)
  const cursorTime = ref('')
  const seekRevision = ref(0)

  let source: EpochTimelineSource | null = null
  let applyEpoch: ((index: number) => void) | null = null
  let replaySpeed = 1
  let animationFrame: number | null = null
  let playbackStartedAt = 0
  let playbackStartedElapsed = 0
  let wasPlayingBeforeDrag = false

  const progress = computed(() =>
    durationMilliseconds.value <= 0
      ? 0
      : Math.min(100, (elapsedMilliseconds.value / durationMilliseconds.value) * 100),
  )

  function cancelAnimation(): void {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
  }

  function setCursorIndex(index: number): void {
    if (!source || source.length === 0) return
    const nextIndex = Math.max(0, Math.min(source.length - 1, Math.round(index)))
    cursorIndex.value = nextIndex
    elapsedMilliseconds.value = source.getElapsedTime(nextIndex)
    cursorTime.value = source.formatTime(nextIndex)
    applyEpoch?.(nextIndex)
  }

  function setElapsedTime(milliseconds: number): void {
    if (!source) return
    const index = source.findNearestElapsedTime(milliseconds)
    if (index >= 0 && index !== cursorIndex.value) setCursorIndex(index)
  }

  function animationTick(now: number): void {
    animationFrame = null
    if (!playing.value || !source) return

    const target =
      playbackStartedElapsed + Math.max(0, now - playbackStartedAt) * Math.max(0.01, replaySpeed)
    if (target >= durationMilliseconds.value) {
      setCursorIndex(source.length - 1)
      playing.value = false
      return
    }

    setElapsedTime(target)
    animationFrame = requestAnimationFrame(animationTick)
  }

  function play(): void {
    if (!source || source.length === 0 || indexing.value) return
    if (cursorIndex.value >= source.length - 1) setCursorIndex(0)
    cancelAnimation()
    playbackStartedAt = performance.now()
    playbackStartedElapsed = elapsedMilliseconds.value
    playing.value = true
    animationFrame = requestAnimationFrame(animationTick)
  }

  function pause(): void {
    playing.value = false
    cancelAnimation()
  }

  function togglePlayback(): void {
    if (playing.value) pause()
    else play()
  }

  function beginDrag(): void {
    if (!active.value || indexing.value) return
    wasPlayingBeforeDrag = playing.value
    pause()
    dragging.value = true
  }

  function previewElapsedTime(milliseconds: number): void {
    if (!dragging.value) beginDrag()
    setElapsedTime(milliseconds)
  }

  function endDrag(): void {
    if (!dragging.value) return
    dragging.value = false
    if (wasPlayingBeforeDrag && cursorIndex.value < totalEpochs.value - 1) play()
    wasPlayingBeforeDrag = false
  }

  function stepEpoch(delta: number): void {
    if (!source || source.length === 0 || indexing.value) return
    pause()
    setCursorIndex(cursorIndex.value + delta)
    seekRevision.value++
  }

  function seekElapsedTime(milliseconds: number): void {
    if (!active.value || indexing.value || !source) return
    pause()
    setElapsedTime(milliseconds)
    seekRevision.value++
  }

  function seekEpoch(epochSource: EpochTimelineSource, index: number): void {
    if (!source || index < 0 || index >= epochSource.length) return
    const timestamp = epochSource.getTimestamp?.(0)
    const firstTimestamp = source.getTimestamp?.(0)
    seekElapsedTime(
      timestamp !== undefined && firstTimestamp !== undefined
        ? recordingClockDifference(timestamp, firstTimestamp) + epochSource.getElapsedTime(index)
        : epochSource.getElapsedTime(index),
    )
  }

  function elapsedFor(epochSource: EpochTimelineSource): number {
    if (!source || !epochSource.length) return elapsedMilliseconds.value
    const base = source.getTimestamp?.(0)
    const targetBase = epochSource.getTimestamp?.(0)
    return base !== undefined && targetBase !== undefined
      ? elapsedMilliseconds.value - recordingClockDifference(targetBase, base)
      : elapsedMilliseconds.value
  }

  function setPlaybackSpeed(speed: number): void {
    const nextSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1
    if (playing.value) {
      playbackStartedElapsed = elapsedMilliseconds.value
      playbackStartedAt = performance.now()
    }
    replaySpeed = nextSpeed
  }

  function beginIndexing(): void {
    pause()
    source = null
    applyEpoch = null
    active.value = true
    indexing.value = true
    indexingProgress.value = 0
    totalEpochs.value = 0
    durationMilliseconds.value = 0
    elapsedMilliseconds.value = 0
    cursorTime.value = ''
  }

  function updateIndexingProgress(value: number): void {
    indexingProgress.value = Math.max(0, Math.min(100, value))
  }

  function attachTimeline(epochSource: EpochTimelineSource, options: TimelineOptions): boolean {
    pause()
    indexing.value = false
    indexingProgress.value = 100
    source = epochSource
    applyEpoch = options.applyEpoch
    mode.value = options.mode
    setPlaybackSpeed(options.speed)
    totalEpochs.value = epochSource.length
    durationMilliseconds.value = epochSource.duration

    if (epochSource.length === 0) {
      active.value = false
      return false
    }

    active.value = true
    const initialIndex =
      options.mode === 'replay'
        ? epochSource.findNearestElapsedTime(options.startElapsedMilliseconds ?? 0)
        : epochSource.length - 1
    setCursorIndex(initialIndex)
    if (options.mode === 'replay' && initialIndex < epochSource.length - 1) play()
    return true
  }

  function clearTimeline(): void {
    pause()
    source = null
    applyEpoch = null
    active.value = false
    indexing.value = false
    indexingProgress.value = 0
    dragging.value = false
    cursorIndex.value = 0
    totalEpochs.value = 0
    elapsedMilliseconds.value = 0
    durationMilliseconds.value = 0
    cursorTime.value = ''
  }

  return {
    active,
    indexing,
    indexingProgress,
    mode,
    playing,
    dragging,
    cursorIndex,
    totalEpochs,
    elapsedMilliseconds,
    durationMilliseconds,
    cursorTime,
    seekRevision,
    progress,
    beginIndexing,
    updateIndexingProgress,
    attachTimeline,
    clearTimeline,
    play,
    pause,
    togglePlayback,
    beginDrag,
    previewElapsedTime,
    endDrag,
    stepEpoch,
    seekElapsedTime,
    seekEpoch,
    elapsedFor,
    setPlaybackSpeed,
  }
}

export type FileTimeline = ReturnType<typeof createFileTimeline>

const defaultTimeline = createFileTimeline()

export function useFileTimeline() {
  return defaultTimeline
}
