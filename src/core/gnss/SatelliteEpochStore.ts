import {
  SATELLITE_EPOCH_CONSTELLATIONS,
  type SatelliteEpochConstellation,
  type SatelliteEpochSample,
} from './SatelliteEpochAssembler'

/**
 * Compact, chunked, append-only epoch store for GNSS satellite-count series.
 *
 * Designed for 12h @ 10Hz workloads (432,000 epochs). Instead of keeping one
 * `SatelliteEpochSample` JS object per epoch (which would pin ~432k objects
 * plus their nested `counts` records in the heap), every field is stored in
 * columnar `TypedArray`s inside fixed-size chunks that grow on demand. Objects
 * are only ever reconstructed transiently when a caller reads a sample.
 *
 * Preserved fields per epoch: time (continuous ms, monotonic across midnight),
 * GPS/GLONASS/BEIDOU/GALILEO/QZSS/OTHER counts, total, complete.
 *
 * Time is stored as a monotonic, continuous millisecond value so ordering,
 * nearest-index and range queries stay correct across a midnight wrap; the
 * wall-clock `HH:MM:SS.mmm` form is produced on demand by `formatTime`.
 *
 * This module is framework-agnostic: it has no dependency on Vue or on the
 * `useNmea` composable.
 */

type Field = SatelliteEpochConstellation | 'total' | 'TOTAL'

interface EpochChunk {
  /** Continuous, monotonic session milliseconds. */
  times: Float64Array
  /** Original wall-clock milliseconds since midnight for labels/tooltips. */
  wallTimes: Uint32Array
  /** Columnar counts, layout [local * 6 + constellationIndex]. */
  counts: Uint16Array
  total: Uint32Array
  complete: Uint8Array
  /** 1 when there is a time gap right before this epoch. */
  gapBefore: Uint8Array
}

const FIELDS = SATELLITE_EPOCH_CONSTELLATIONS
const FIELD_COUNT = FIELDS.length

const FIELD_INDEX: Record<string, number> = {}
FIELDS.forEach((name, index) => {
  FIELD_INDEX[name] = index
})

/** One chunk per hour at 10Hz (3600s * 10 = 36000); tests use 4096. */
const DEFAULT_CHUNK_SIZE = 4096
const MS_PER_DAY = 86_400_000
/** A gap is a step larger than twice the smallest observed interval. */
const GAP_FACTOR = 2

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function pad3(value: number): string {
  return String(value).padStart(3, '0')
}

function modDay(ms: number): number {
  return ((ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY
}

function formatMs(ms: number): string {
  const t = modDay(ms)
  const hh = Math.floor(t / 3_600_000)
  const rest = t % 3_600_000
  const mm = Math.floor(rest / 60_000)
  const rest2 = rest % 60_000
  const ss = Math.floor(rest2 / 1_000)
  const mmm = Math.floor(rest2 % 1_000)
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}.${pad3(mmm)}`
}

function parseWallToMs(time: string): number {
  const match = String(time)
    .trim()
    .match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/)
  if (!match) return Number(time) || 0
  const hh = Number(match[1])
  const mm = Number(match[2])
  const ss = Number(match[3])
  let ms = (hh * 3600 + mm * 60 + ss) * 1000
  if (match[4]) {
    const digits = match[4]
    ms += (parseInt(digits, 10) / Math.pow(10, digits.length)) * 1000
  }
  return ms
}

function normalizeField(field: string): Field {
  if (field === 'TOTAL' || field === 'total') return 'total'
  return field as Field
}

export class SatelliteEpochStore {
  private readonly chunkSize: number
  private chunks: EpochChunk[] = []
  private _length = 0
  private minInterval = Infinity

  public constructor(options: { chunkSize?: number } = {}) {
    this.chunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_SIZE))
  }

  /** Total number of stored epochs. */
  public get length(): number {
    return this._length
  }

  /** Allocated epoch capacity across all chunks (>= length). */
  public get capacity(): number {
    return this.chunks.length * this.chunkSize
  }

  public get chunkCount(): number {
    return this.chunks.length
  }

  private allocChunk(): EpochChunk {
    const size = this.chunkSize
    return {
      times: new Float64Array(size),
      wallTimes: new Uint32Array(size),
      counts: new Uint16Array(size * FIELD_COUNT),
      total: new Uint32Array(size),
      complete: new Uint8Array(size),
      gapBefore: new Uint8Array(size),
    }
  }

  private chunkOf(index: number): EpochChunk {
    return this.chunks[Math.floor(index / this.chunkSize)]
  }

  private localOf(index: number): number {
    return index % this.chunkSize
  }

  public append(sample: SatelliteEpochSample): void {
    const wallMs = parseWallToMs(sample.time)
    let chunkIndex = Math.floor(this._length / this.chunkSize)
    if (chunkIndex >= this.chunks.length) {
      this.chunks.push(this.allocChunk())
    }
    const chunk = this.chunks[chunkIndex]
    const local = this._length % this.chunkSize

    let newCont: number
    if (this._length === 0) {
      newCont = wallMs
    } else {
      const prevCont = this.getTime(this._length - 1)
      const prevWall = modDay(prevCont)
      let delta = wallMs - prevWall
      if (delta < -MS_PER_DAY / 2) delta += MS_PER_DAY
      newCont = prevCont + delta
      const step = newCont - prevCont
      if (step < 0) {
        // Receiver/file streams can contain a small out-of-order GGA pair.
        // Preserve the arrival and its wall-clock label, but keep the session
        // search time non-decreasing and break the rendered line at this point.
        newCont = prevCont
        chunk.gapBefore[local] = 1
      } else if (step > 0) {
        if (step < this.minInterval) this.minInterval = step
        chunk.gapBefore[local] = step > this.minInterval * GAP_FACTOR ? 1 : 0
      } else {
        chunk.gapBefore[local] = 0
      }
    }

    chunk.times[local] = newCont
    chunk.wallTimes[local] = Math.round(modDay(wallMs))
    for (let k = 0; k < FIELD_COUNT; k += 1) {
      const value = sample.counts[FIELDS[k]] ?? 0
      chunk.counts[local * FIELD_COUNT + k] = value > 0xffff ? 0xffff : value
    }
    chunk.total[local] = sample.total >>> 0
    chunk.complete[local] = sample.complete ? 1 : 0

    this._length += 1
  }

  public clear(): void {
    this.chunks = []
    this._length = 0
    this.minInterval = Infinity
  }

  /** Continuous millisecond timestamp for the epoch at `index`. */
  private getTime(index: number): number {
    if (index < 0 || index >= this._length) {
      throw new RangeError(`epoch index out of range: ${index}`)
    }
    return this.chunkOf(index).times[this.localOf(index)]
  }

  /** Read a single epoch, reconstructing a transient `SatelliteEpochSample`. */
  public getSample(index: number): SatelliteEpochSample {
    if (index < 0 || index >= this._length) {
      throw new RangeError(`epoch index out of range: ${index}`)
    }
    const chunk = this.chunkOf(index)
    const local = this.localOf(index)
    const counts = {} as Record<SatelliteEpochConstellation, number>
    for (let k = 0; k < FIELD_COUNT; k += 1) {
      counts[FIELDS[k]] = chunk.counts[local * FIELD_COUNT + k]
    }
    const time = formatMs(chunk.wallTimes[local])
    return {
      key: time,
      time,
      counts,
      total: chunk.total[local],
      complete: chunk.complete[local] === 1,
    }
  }

  /** Wall-clock `HH:MM:SS.mmm` string for the epoch at `index`. */
  public formatTime(index: number): string {
    if (index < 0 || index >= this._length) {
      throw new RangeError(`epoch index out of range: ${index}`)
    }
    const chunk = this.chunkOf(index)
    return formatMs(chunk.wallTimes[this.localOf(index)])
  }

  /** Milliseconds elapsed from the first stored satellite epoch. */
  public getElapsedTime(index: number): number {
    return this.getTime(index) - this.getTime(0)
  }

  /** Total recorded duration in milliseconds. */
  public get duration(): number {
    return this._length < 2 ? 0 : this.getTime(this._length - 1) - this.getTime(0)
  }

  /** Locate the satellite epoch nearest to an elapsed recording time. */
  public findNearestElapsedTime(elapsedMilliseconds: number): number {
    if (this._length === 0) return -1
    const elapsed = Number.isFinite(elapsedMilliseconds) ? elapsedMilliseconds : 0
    return this.findNearestIndex(this.getTime(0) + Math.max(0, Math.min(elapsed, this.duration)))
  }

  private getValue(index: number, field: Field): number {
    const chunk = this.chunkOf(index)
    const local = this.localOf(index)
    if (field === 'total') return chunk.total[local]
    return chunk.counts[local * FIELD_COUNT + FIELD_INDEX[field]]
  }

  private isGap(index: number): boolean {
    return this.chunkOf(index).gapBefore[this.localOf(index)] === 1
  }

  private isComplete(index: number): boolean {
    return this.chunkOf(index).complete[this.localOf(index)] === 1
  }

  private hasBreakBetween(previous: number, current: number): boolean {
    for (let index = previous + 1; index <= current; index += 1) {
      if (this.isGap(index) || !this.isComplete(index)) return true
    }
    return false
  }

  /**
   * Index of the epoch whose timestamp is closest to `target` (continuous ms,
   * or a `HH:MM:SS.f` wall-clock string resolved onto the data's day).
   * O(log n). Out-of-range queries clamp to the ends; empty store -> -1.
   */
  public findNearestIndex(target: number | string): number {
    if (this._length === 0) return -1
    let query: number
    if (typeof target === 'number') {
      query = target
    } else {
      const wall = parseWallToMs(target)
      const mid = (this.getTime(0) + this.getTime(this._length - 1)) / 2
      const k = Math.round((mid - wall) / MS_PER_DAY)
      query = wall + k * MS_PER_DAY
    }

    let lo = 0
    let hi = this._length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.getTime(mid) < query) lo = mid + 1
      else hi = mid
    }
    if (lo === 0) return 0
    if (lo >= this._length) return this._length - 1
    const distLo = Math.abs(this.getTime(lo) - query)
    const distPrev = Math.abs(this.getTime(lo - 1) - query)
    return distPrev <= distLo ? lo - 1 : lo
  }

  /**
   * Extreme-preserving time-series extraction over [start, end].
   *
   * Returns `{ points, segments, lod }` where `points` is a flat array of
   * `[epochIndex, value, ...]` for every *complete* epoch, and `segments` is a
   * flat array of `[stripStart, stripLength, ...]` describing line-strip
   * breaks (a break occurs at a missing/incomplete epoch or a true time gap).
   *
   * When `maxPoints >=` the number of complete epochs, every epoch is returned
   * verbatim (`lod: false`). Otherwise the series is decimated to at most
   * `maxPoints` points while always keeping the first, last, global min and
   * global max, so sudden rises and drops are not flattened away.
   */
  public extractSeries(
    field: Field,
    start: number,
    end: number,
    maxPoints: number,
  ): { points: number[]; segments: number[]; lod: boolean } {
    const f = normalizeField(field as string)
    if (this._length === 0 || maxPoints <= 0) {
      return { points: [], segments: [], lod: false }
    }
    const from = Math.max(0, Math.min(start, this._length - 1))
    const to = Math.max(from, Math.min(end, this._length - 1))

    const completeIndices: number[] = []
    let needsLod = false
    for (let i = from; i <= to; i += 1) {
      if (!this.isComplete(i)) continue
      completeIndices.push(i)
      if (completeIndices.length > maxPoints) {
        needsLod = true
        break
      }
    }

    const selected = needsLod ? this.decimateRange(from, to, f, maxPoints) : completeIndices
    if (selected.length === 0) {
      return { points: [], segments: [], lod: false }
    }

    const points: number[] = []
    for (const idx of selected) points.push(idx, this.getValue(idx, f))

    const segments: number[] = []
    let stripStart = 0
    let stripLen = 1
    for (let j = 1; j < selected.length; j += 1) {
      const prev = selected[j - 1]
      const cur = selected[j]
      const connected = needsLod
        ? !this.hasBreakBetween(prev, cur)
        : cur === prev + 1 && !this.isGap(cur)
      if (connected) {
        stripLen += 1
      } else {
        segments.push(stripStart, stripLen)
        stripStart = j
        stripLen = 1
      }
    }
    segments.push(stripStart, stripLen)

    return { points, segments, lod: needsLod }
  }

  /**
   * Pixel-oriented min/max decimation without allocating an O(epochCount)
   * temporary array. Each raw-index bucket contributes its two extremes, while
   * the first and last complete epochs remain explicit.
   */
  private decimateRange(from: number, to: number, field: Field, maxPoints: number): number[] {
    let first = -1
    let last = -1
    for (let index = from; index <= to; index += 1) {
      if (this.isComplete(index)) {
        first = index
        break
      }
    }
    for (let index = to; index >= from; index -= 1) {
      if (this.isComplete(index)) {
        last = index
        break
      }
    }
    if (first < 0) return []
    if (maxPoints === 1 || first === last) return [first]
    if (maxPoints === 2) return [first, last]
    if (maxPoints === 3) {
      const baseline = (this.getValue(first, field) + this.getValue(last, field)) / 2
      let extreme = first
      let deviation = -1
      for (let index = first + 1; index < last; index += 1) {
        if (!this.isComplete(index)) continue
        const nextDeviation = Math.abs(this.getValue(index, field) - baseline)
        if (nextDeviation > deviation) {
          extreme = index
          deviation = nextDeviation
        }
      }
      return extreme === first ? [first, last] : [first, extreme, last]
    }

    const selected = new Set<number>()
    selected.add(first)
    selected.add(last)

    const interiorStart = first + 1
    const interiorEnd = last
    const interiorLength = Math.max(0, interiorEnd - interiorStart)
    const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2))

    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = interiorStart + Math.floor((interiorLength * bucket) / bucketCount)
      const end = interiorStart + Math.floor((interiorLength * (bucket + 1)) / bucketCount)
      let minIndex = -1
      let maxIndex = -1
      let minValue = Infinity
      let maxValue = -Infinity

      for (let index = start; index < end; index += 1) {
        if (!this.isComplete(index)) continue
        const value = this.getValue(index, field)
        if (value < minValue) {
          minValue = value
          minIndex = index
        }
        if (value > maxValue) {
          maxValue = value
          maxIndex = index
        }
      }

      if (minIndex >= 0) selected.add(minIndex)
      if (maxIndex >= 0) selected.add(maxIndex)
    }

    return [...selected].sort((a, b) => a - b)
  }

  /** Maximum `field` value over [start, end] (all epochs, complete or not). */
  public getRangeMax(field: Field, start: number, end: number): number {
    if (this._length === 0) return 0
    const f = normalizeField(field as string)
    const from = Math.max(0, Math.min(start, this._length - 1))
    const to = Math.max(from, Math.min(end, this._length - 1))
    let max = -Infinity
    for (let i = from; i <= to; i += 1) {
      const v = this.getValue(i, f)
      if (v > max) max = v
    }
    return max === -Infinity ? 0 : max
  }
}

export { SATELLITE_EPOCH_CONSTELLATIONS }
