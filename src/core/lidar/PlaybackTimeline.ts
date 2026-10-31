// Playback always uses real log time. This index only chooses the next inspection point.
import type { McapDocument } from './McapDocument'

export const PLAYBACK_STEP_MODES = ['planner', 'scan', 'events'] as const
export type PlaybackStepMode = (typeof PLAYBACK_STEP_MODES)[number]

const STEP_TOPICS = { planner: '/planner_state', scan: '/scan_raw' } as const

export function isPlaybackStepMode(value: unknown): value is PlaybackStepMode {
  return PLAYBACK_STEP_MODES.some((mode) => mode === value)
}

export function availableStepModes(doc: McapDocument): PlaybackStepMode[] {
  return PLAYBACK_STEP_MODES.filter(
    (mode) => mode === 'events' || (doc.topicInfo(STEP_TOPICS[mode])?.messageCount ?? 0) > 0,
  )
}

/** An immutable per-document index, shared by counters, buttons and keyboard stepping. */
export class PlaybackTimeline {
  public readonly mode: PlaybackStepMode
  private readonly times: Float64Array

  public constructor(doc: McapDocument, preferredMode: PlaybackStepMode = 'planner') {
    const available = availableStepModes(doc)
    this.mode = available.includes(preferredMode) ? preferredMode : available[0]
    if (this.mode === 'events') {
      this.times = doc.allTimesNs
    } else {
      const topic = STEP_TOPICS[this.mode]
      const count = doc.topicInfo(topic)?.messageCount ?? 0
      const times: number[] = []
      for (let index = 0; index < count; index++) {
        const time = doc.timeAt(topic, index)
        if (times.length === 0 || times[times.length - 1] !== time) times.push(time)
      }
      this.times = Float64Array.from(times)
    }
  }

  public get total(): number {
    return this.times.length
  }

  /** One-based record position; zero means the selected source has not published yet. */
  public positionAt(timeNs: number): number {
    return this.bound(timeNs, true)
  }

  /** Strictly next/previous source time, with multi-step movement clamped at the ends. */
  public timeForStep(timeNs: number, delta: number): number | undefined {
    if (!Number.isFinite(delta) || Math.trunc(delta) === 0) return undefined
    const steps = Math.trunc(delta)
    const index = steps > 0 ? this.bound(timeNs, true) : this.bound(timeNs, false) - 1
    if (index < 0 || index >= this.times.length) return undefined
    const target = index + steps - Math.sign(steps)
    return this.times[Math.max(0, Math.min(this.times.length - 1, target))]
  }

  private bound(timeNs: number, includeEqual: boolean): number {
    let lo = 0
    let hi = this.times.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.times[mid] < timeNs || (includeEqual && this.times[mid] === timeNs)) lo = mid + 1
      else hi = mid
    }
    return lo
  }
}
