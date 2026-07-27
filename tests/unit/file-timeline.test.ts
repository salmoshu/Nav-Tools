import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NumericEpochStore } from '@/core/gnss/NumericEpochStore'

/**
 * Tests for `src/composables/useFileTimeline.ts`.
 *
 * The composable keeps all of its state at module scope, so each test re-imports
 * the module through `vi.resetModules()` to start from a clean slate. Playback is
 * driven by `requestAnimationFrame` + `performance.now()`, both of which are
 * replaced with controllable stubs so we can advance a virtual clock and invoke
 * the queued animation callback on demand.
 */

let currentTime: number
let rafId: number
let pendingCallback: ((time: number) => void) | null

function stubGlobals(): void {
  currentTime = 0
  rafId = 0
  pendingCallback = null

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    pendingCallback = callback as (time: number) => void
    rafId += 1
    return rafId
  })
  vi.stubGlobal('cancelAnimationFrame', (): void => {
    pendingCallback = null
  })
  vi.stubGlobal('performance', { now: (): number => currentTime } as unknown as Performance)
}

/** Invoke the currently queued animation frame with the virtual clock advanced. */
function stepPlayback(advanceBy: number): void {
  const callback = pendingCallback
  if (!callback) return
  pendingCallback = null
  currentTime += advanceBy
  callback(currentTime)
}

/** Drive playback until it stops rescheduling or hits the step ceiling. */
function runPlaybackToEnd(maxSteps = 500, delta = 50): void {
  let steps = 0
  while (pendingCallback && steps < maxSteps) {
    stepPlayback(delta)
    steps += 1
  }
}

function buildStore(count = 11, stepMs = 100): NumericEpochStore {
  const store = new NumericEpochStore(['V'], { chunkSize: 4096 })
  const base = Date.parse('2026-07-26T12:00:00.000Z')
  for (let index = 0; index < count; index += 1) {
    store.append(new Date(base + index * stepMs).toISOString(), { V: index })
  }
  return store
}

async function freshTimeline() {
  vi.resetModules()
  const mod = await import('@/composables/useFileTimeline')
  return mod.useFileTimeline()
}

describe('useFileTimeline', () => {
  beforeEach(() => {
    stubGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('lands on the last epoch by default in loaded mode', async () => {
    const timeline = await freshTimeline()
    const store = buildStore()

    timeline.attachTimeline(store, {
      mode: 'loaded',
      speed: 1,
      applyEpoch: () => {},
    })

    expect(timeline.mode.value).toBe('loaded')
    expect(timeline.active.value).toBe(true)
    // Default cursor is the final epoch.
    expect(timeline.cursorIndex.value).toBe(store.length - 1)
    expect(timeline.cursorIndex.value).toBe(10)
    // Elapsed time tracks the tail of the recording.
    expect(timeline.elapsedMilliseconds.value).toBe(timeline.durationMilliseconds.value)
    expect(timeline.durationMilliseconds.value).toBe(1000)
    // Loaded mode never auto-plays.
    expect(timeline.playing.value).toBe(false)
    expect(pendingCallback).toBeNull()
  })

  it('begins from the first epoch and auto-plays in replay mode', async () => {
    const timeline = await freshTimeline()
    const store = buildStore()

    timeline.attachTimeline(store, {
      mode: 'replay',
      speed: 1,
      applyEpoch: () => {},
    })

    expect(timeline.mode.value).toBe('replay')
    expect(timeline.cursorIndex.value).toBe(0)
    expect(timeline.elapsedMilliseconds.value).toBe(0)
    // Replay mode starts playback immediately.
    expect(timeline.playing.value).toBe(true)
    expect(pendingCallback).not.toBeNull()
  })

  it('starts replay at the epoch nearest to the configured time offset', async () => {
    const timeline = await freshTimeline()
    const store = buildStore()

    timeline.attachTimeline(store, {
      mode: 'replay',
      speed: 1,
      startElapsedMilliseconds: 370,
      applyEpoch: () => {},
    })

    expect(timeline.cursorIndex.value).toBe(4)
    expect(timeline.elapsedMilliseconds.value).toBe(400)
    expect(timeline.playing.value).toBe(true)
  })

  it('snaps to the nearest epoch for an arbitrary elapsed time', async () => {
    const timeline = await freshTimeline()
    const store = buildStore()

    timeline.attachTimeline(store, {
      mode: 'loaded',
      speed: 1,
      applyEpoch: () => {},
    })

    // Epochs are spaced 100ms apart; 120ms is nearest to epoch index 1 (100ms).
    timeline.previewElapsedTime(120)
    expect(timeline.cursorIndex.value).toBe(1)
    expect(timeline.elapsedMilliseconds.value).toBe(100)

    // 370ms is nearest to epoch index 4 (400ms), not index 3 (300ms).
    timeline.previewElapsedTime(370)
    expect(timeline.cursorIndex.value).toBe(4)
    expect(timeline.elapsedMilliseconds.value).toBe(400)

    timeline.endDrag()
  })

  it('stops playback once it reaches the final epoch', async () => {
    const timeline = await freshTimeline()
    const store = buildStore()

    timeline.attachTimeline(store, {
      mode: 'replay',
      speed: 1,
      applyEpoch: () => {},
    })
    expect(timeline.playing.value).toBe(true)

    runPlaybackToEnd()

    expect(timeline.playing.value).toBe(false)
    expect(pendingCallback).toBeNull()
    expect(timeline.cursorIndex.value).toBe(store.length - 1)
    expect(timeline.elapsedMilliseconds.value).toBe(1000)
  })

  it('temporarily pauses while dragging during playback and resumes on release', async () => {
    const timeline = await freshTimeline()
    const store = buildStore()

    timeline.attachTimeline(store, {
      mode: 'replay',
      speed: 1,
      applyEpoch: () => {},
    })
    expect(timeline.playing.value).toBe(true)

    // Begin dragging while playing.
    timeline.beginDrag()
    expect(timeline.dragging.value).toBe(true)
    expect(timeline.playing.value).toBe(false)
    const queuedWhilePaused = pendingCallback
    expect(queuedWhilePaused).toBeNull()

    // Move the cursor; playback stays paused.
    timeline.previewElapsedTime(300)
    expect(timeline.cursorIndex.value).toBe(3)
    expect(timeline.elapsedMilliseconds.value).toBe(300)
    expect(timeline.playing.value).toBe(false)
    expect(pendingCallback).toBeNull()

    // Releasing should restore playback because it was playing before the drag.
    timeline.endDrag()
    expect(timeline.dragging.value).toBe(false)
    expect(timeline.playing.value).toBe(true)
    expect(pendingCallback).not.toBeNull()

    // Confirm it is genuinely advancing again.
    const resumedIndex = timeline.cursorIndex.value
    stepPlayback(250)
    expect(timeline.cursorIndex.value).toBeGreaterThan(resumedIndex)
  })

  it('keeps playback paused after dragging while already paused', async () => {
    const timeline = await freshTimeline()
    const store = buildStore()

    timeline.attachTimeline(store, {
      mode: 'loaded',
      speed: 1,
      applyEpoch: () => {},
    })
    expect(timeline.playing.value).toBe(false)

    timeline.beginDrag()
    expect(timeline.dragging.value).toBe(true)

    timeline.previewElapsedTime(300)
    expect(timeline.cursorIndex.value).toBe(3)
    expect(timeline.playing.value).toBe(false)

    // Releasing while paused must not start playback.
    timeline.endDrag()
    expect(timeline.dragging.value).toBe(false)
    expect(timeline.playing.value).toBe(false)
    expect(pendingCallback).toBeNull()
  })

  it('pauses when stepping through epochs', async () => {
    const timeline = await freshTimeline()
    const store = buildStore()

    timeline.attachTimeline(store, {
      mode: 'replay',
      speed: 1,
      applyEpoch: () => {},
    })
    expect(timeline.playing.value).toBe(true)
    expect(pendingCallback).not.toBeNull()

    // Stepping from a playing state must pause playback.
    timeline.stepEpoch(1)
    expect(timeline.playing.value).toBe(false)
    expect(pendingCallback).toBeNull()
    expect(timeline.cursorIndex.value).toBe(1)

    // Stepping while already paused stays paused.
    timeline.stepEpoch(1)
    expect(timeline.playing.value).toBe(false)
    expect(timeline.cursorIndex.value).toBe(2)
  })
})
