/**
 * Framework-independent rolling history of per-satellite SNR samples.
 *
 * The realtime signal panel only keeps the latest GSV snapshot; this store adds
 * a bounded per-satellite timeline so a selected satellite's SNR can be plotted
 * epoch by epoch. Epochs are committed once per GGA fix (GSV blocks precede
 * their GGA in the supported receiver stream), so every retained epoch aligns
 * across satellites, with `null` marking epochs where a satellite was absent.
 */

export interface SnrHistorySample {
  prn: string
  constellation: string
  snr: number
}

export interface SnrHistoryPoint {
  /** Raw epoch time as committed (e.g. compact GGA UTC `123519.00`). */
  time: string
  /** SNR in dB; `null` when the satellite was absent at that epoch. */
  snr: number | null
}

/** ~2 minutes of 1 Hz epochs; small enough that trimming stays cheap. */
export const SNR_HISTORY_DEFAULT_CAPACITY = 120

/** Satellite identity shared with the latest-snapshot map in useNmea. */
export function snrHistoryKey(constellation: string, prn: string | number): string {
  return `${constellation}-${prn}`
}

/** Compact/colon/datetime epoch time -> `HH:MM:SS` axis label. */
export function formatSnrEpochLabel(time: string): string {
  const source = String(time).trim()
  const compact = source.match(/^(\d{2})(\d{2})(\d{2})(?:\.\d+)?$/)
  if (compact) return `${compact[1]}:${compact[2]}:${compact[3]}`
  const colon = source.match(/(\d{1,2}):(\d{2}):(\d{2})/)
  if (colon) return `${colon[1].padStart(2, '0')}:${colon[2]}:${colon[3]}`
  return source
}

export class SnrHistoryStore {
  private readonly capacity: number
  private epochTimes: string[] = []
  private readonly seriesByKey = new Map<string, (number | null)[]>()

  constructor(capacity = SNR_HISTORY_DEFAULT_CAPACITY) {
    this.capacity = Math.max(1, Math.trunc(capacity))
  }

  /** Number of retained epochs. */
  public get length(): number {
    return this.epochTimes.length
  }

  /** Satellite keys with retained samples, sorted by constellation then PRN. */
  public get keys(): string[] {
    return [...this.seriesByKey.keys()].sort((a, b) => {
      const [constellationA, prnA] = a.split('-')
      const [constellationB, prnB] = b.split('-')
      if (constellationA !== constellationB) return constellationA.localeCompare(constellationB)
      return (parseInt(prnA) || 0) - (parseInt(prnB) || 0)
    })
  }

  public has(key: string): boolean {
    return this.seriesByKey.has(key)
  }

  public getEpochTimes(): readonly string[] {
    return this.epochTimes
  }

  /** Points aligned with `getEpochTimes()`, in epoch order. */
  public getSeries(key: string): SnrHistoryPoint[] {
    const series = this.seriesByKey.get(key)
    if (!series) return []
    return this.epochTimes.map((time, index) => ({ time, snr: series[index] }))
  }

  /**
   * Commit one epoch of satellite samples. Re-committing the same logical time
   * replaces the previous snapshot of that epoch (mirrors the epoch stores fed
   * by the same GGA commit path).
   */
  public appendEpoch(time: string, samples: readonly SnrHistorySample[]): void {
    if (!time) return
    const replaceLast =
      this.epochTimes.length > 0 && this.epochTimes[this.epochTimes.length - 1] === time
    if (replaceLast) {
      for (const series of this.seriesByKey.values()) series[series.length - 1] = null
    } else {
      this.epochTimes.push(time)
      for (const series of this.seriesByKey.values()) series.push(null)
    }
    const index = this.epochTimes.length - 1
    for (const sample of samples) {
      const key = snrHistoryKey(sample.constellation, sample.prn)
      let series = this.seriesByKey.get(key)
      if (!series) {
        series = new Array<number | null>(this.epochTimes.length).fill(null)
        this.seriesByKey.set(key, series)
      }
      series[index] = Number(sample.snr) || 0
    }
    if (this.epochTimes.length > this.capacity) this.trim()
  }

  public clear(): void {
    this.epochTimes = []
    this.seriesByKey.clear()
  }

  private trim(): void {
    const overflow = this.epochTimes.length - this.capacity
    this.epochTimes.splice(0, overflow)
    for (const [key, series] of this.seriesByKey) {
      series.splice(0, overflow)
      // Drop satellites that no longer have any sample inside the window.
      if (!series.some((value) => value !== null)) this.seriesByKey.delete(key)
    }
  }
}
