/**
 * Framework-independent, compact storage for numeric GNSS time series.
 *
 * Samples are kept in a chunked structure-of-arrays layout. A store therefore
 * grows without repeatedly copying its history and does not retain one object
 * per epoch, which keeps 12 h × 10 Hz workloads practical.
 */

export type NumericEpochValues =
  Readonly<Record<string, number | null | undefined>> | readonly (number | null | undefined)[]

export interface NumericEpochStoreOptions {
  chunkSize?: number
  valuePrecision?: 'float32' | 'float64'
}

export interface NumericEpochAppendOptions {
  /** Replace the last row when it has exactly the same logical timestamp. */
  replaceLast?: boolean
}

export interface NumericSeriesExtraction {
  /** Flat `[epochIndex, value, ...]` pairs. */
  points: number[]
  /** Flat `[pointOffset, pointCount, ...]` WebGL line-strip ranges. */
  segments: number[]
  lod: boolean
}

export interface NumericRange {
  min: number
  max: number
}

interface EpochChunk {
  /** Monotonic session milliseconds (absolute for full date/time inputs). */
  times: Float64Array
  /** Original displayed time of day, in milliseconds. */
  wallTimes: Uint32Array
  /** Columnar values: `[localIndex * fieldCount + fieldIndex]`. */
  values: Float32Array | Float64Array
  /** A discontinuity occurs immediately before rows marked with 1. */
  gapBefore: Uint8Array
}

interface ParsedTime {
  time: number
  wallTime: number
  absolute: boolean
}

const DEFAULT_CHUNK_SIZE = 4096
const MS_PER_DAY = 86_400_000
const GAP_FACTOR = 2

function moduloDay(value: number): number {
  return ((value % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

function parseClockParts(hoursText: string, minutesText: string, secondsText: string): number {
  const hours = Number(hoursText)
  const minutes = Number(minutesText)
  const seconds = Number(secondsText)
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isFinite(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds >= 60
  ) {
    throw new RangeError('invalid time of day')
  }
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000)
}

function parseTime(input: string): ParsedTime {
  const source = String(input).trim()

  const colonTime = source.match(/^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/)
  if (colonTime) {
    const wallTime = parseClockParts(colonTime[1], colonTime[2], colonTime[3])
    return { time: wallTime, wallTime: moduloDay(wallTime), absolute: false }
  }

  const compactTime = source.match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)$/)
  if (compactTime) {
    const wallTime = parseClockParts(compactTime[1], compactTime[2], compactTime[3])
    return { time: wallTime, wallTime: moduloDay(wallTime), absolute: false }
  }

  // Retain the time as written for labels even when an ISO offset is present.
  const dateClock = source.match(/[T\s](\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/)
  const absoluteTime = Date.parse(source)
  if (!dateClock || !Number.isFinite(absoluteTime)) {
    throw new RangeError(`invalid epoch time: ${input}`)
  }
  const wallTime = parseClockParts(dateClock[1], dateClock[2], dateClock[3])
  return { time: absoluteTime, wallTime: moduloDay(wallTime), absolute: true }
}

function formatWallTime(milliseconds: number): string {
  const value = moduloDay(Math.round(milliseconds))
  const hours = Math.floor(value / 3_600_000)
  const minutes = Math.floor(value / 60_000) % 60
  const seconds = Math.floor(value / 1000) % 60
  const millis = value % 1000
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`
}

export class NumericEpochStore {
  public readonly fields: readonly string[]

  private readonly chunkSize: number
  private readonly valuePrecision: 'float32' | 'float64'
  private readonly fieldIndices = new Map<string, number>()
  private readonly chunks: EpochChunk[] = []
  private _length = 0
  private minimumInterval = Infinity

  public constructor(fields: readonly string[], options: NumericEpochStoreOptions = {}) {
    if (fields.length === 0) throw new RangeError('at least one numeric field is required')
    for (const field of fields) {
      if (!field || this.fieldIndices.has(field)) {
        throw new RangeError(`invalid or duplicate numeric field: ${field}`)
      }
      this.fieldIndices.set(field, this.fieldIndices.size)
    }
    this.fields = Object.freeze([...fields])
    this.chunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_SIZE))
    this.valuePrecision = options.valuePrecision ?? 'float32'
  }

  public get length(): number {
    return this._length
  }

  public get capacity(): number {
    return this.chunks.length * this.chunkSize
  }

  public get chunkCount(): number {
    return this.chunks.length
  }

  private allocateChunk(): EpochChunk {
    return {
      times: new Float64Array(this.chunkSize),
      wallTimes: new Uint32Array(this.chunkSize),
      values:
        this.valuePrecision === 'float64'
          ? new Float64Array(this.chunkSize * this.fields.length)
          : new Float32Array(this.chunkSize * this.fields.length),
      gapBefore: new Uint8Array(this.chunkSize),
    }
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this._length) {
      throw new RangeError(`epoch index out of range: ${index}`)
    }
  }

  private fieldIndex(field: string): number {
    const index = this.fieldIndices.get(field)
    if (index === undefined) throw new RangeError(`unknown numeric field: ${field}`)
    return index
  }

  private chunkAt(index: number): EpochChunk {
    return this.chunks[Math.floor(index / this.chunkSize)]
  }

  private localAt(index: number): number {
    return index % this.chunkSize
  }

  private timeAt(index: number): number {
    const chunk = this.chunkAt(index)
    return chunk.times[this.localAt(index)]
  }

  private rawValue(fieldIndex: number, index: number): number {
    const chunk = this.chunkAt(index)
    return chunk.values[this.localAt(index) * this.fields.length + fieldIndex]
  }

  private writeValues(chunk: EpochChunk, local: number, values: NumericEpochValues): void {
    const offset = local * this.fields.length
    const sequence = values as readonly (number | null | undefined)[]
    const record = values as Readonly<Record<string, number | null | undefined>>
    for (let field = 0; field < this.fields.length; field += 1) {
      const value = Array.isArray(values) ? sequence[field] : record[this.fields[field]]
      chunk.values[offset + field] =
        value === null || value === undefined || !Number.isFinite(value) ? Number.NaN : value
    }
  }

  /**
   * Append an epoch and return its index. With `replaceLast`, a matching final
   * timestamp is updated in place, allowing RMC/VTG values to be coalesced.
   */
  public append(
    time: string,
    values: NumericEpochValues,
    options: NumericEpochAppendOptions = {},
  ): number {
    const parsed = parseTime(time)
    let continuousTime = parsed.time
    let gapBefore = false

    if (this._length > 0) {
      const previousTime = this.timeAt(this._length - 1)
      if (!parsed.absolute) {
        const previousWall = moduloDay(previousTime)
        let delta = parsed.wallTime - previousWall
        if (delta < -MS_PER_DAY / 2) delta += MS_PER_DAY
        continuousTime = previousTime + delta
      }

      const step = continuousTime - previousTime
      if (options.replaceLast && step === 0) {
        const lastIndex = this._length - 1
        const chunk = this.chunkAt(lastIndex)
        const local = this.localAt(lastIndex)
        this.writeValues(chunk, local, values)
        chunk.wallTimes[local] = parsed.wallTime
        return lastIndex
      }

      if (step < 0) {
        // Keep arrival order searchable while explicitly breaking the line.
        continuousTime = previousTime
        gapBefore = true
      } else if (step > 0) {
        if (step < this.minimumInterval) this.minimumInterval = step
        gapBefore = step > this.minimumInterval * GAP_FACTOR
      }
    }

    const chunkIndex = Math.floor(this._length / this.chunkSize)
    if (chunkIndex === this.chunks.length) this.chunks.push(this.allocateChunk())
    const chunk = this.chunks[chunkIndex]
    const local = this._length % this.chunkSize
    chunk.times[local] = continuousTime
    chunk.wallTimes[local] = parsed.wallTime
    chunk.gapBefore[local] = gapBefore ? 1 : 0
    this.writeValues(chunk, local, values)

    this._length += 1
    return this._length - 1
  }

  public clear(): void {
    this.chunks.length = 0
    this._length = 0
    this.minimumInterval = Infinity
  }

  public formatTime(index: number): string {
    this.assertIndex(index)
    const chunk = this.chunkAt(index)
    return formatWallTime(chunk.wallTimes[this.localAt(index)])
  }

  /** Milliseconds elapsed from the first stored epoch. */
  public getElapsedTime(index: number): number {
    this.assertIndex(index)
    return this.timeAt(index) - this.timeAt(0)
  }

  /** Total recorded duration in milliseconds. */
  public get duration(): number {
    return this._length < 2 ? 0 : this.timeAt(this._length - 1) - this.timeAt(0)
  }

  /** Locate the epoch nearest to an elapsed recording time. */
  public findNearestElapsedTime(elapsedMilliseconds: number): number {
    if (this._length === 0) return -1
    const target =
      this.timeAt(0) +
      Math.max(
        0,
        Math.min(Number.isFinite(elapsedMilliseconds) ? elapsedMilliseconds : 0, this.duration),
      )
    let low = 0
    let high = this._length - 1

    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (this.timeAt(middle) < target) low = middle + 1
      else high = middle
    }

    if (low === 0) return 0
    const previous = low - 1
    return target - this.timeAt(previous) <= this.timeAt(low) - target ? previous : low
  }

  /** Read one value for tooltip/detail use; stored NaN is exposed as `null`. */
  public getValue(field: string, index: number): number | null {
    this.assertIndex(index)
    const value = this.rawValue(this.fieldIndex(field), index)
    return Number.isFinite(value) ? value : null
  }

  private isGap(index: number): boolean {
    return this.chunkAt(index).gapBefore[this.localAt(index)] === 1
  }

  private hasBreakBetween(fieldIndex: number, previous: number, current: number): boolean {
    for (let index = previous + 1; index <= current; index += 1) {
      if (this.isGap(index) || !Number.isFinite(this.rawValue(fieldIndex, index))) return true
    }
    return false
  }

  /**
   * Extract a field over the inclusive `[start, end]` range. When required,
   * each display bucket contributes its min and max so short spikes survive.
   */
  public extractSeries(
    field: string,
    start: number,
    end: number,
    maxPoints: number,
  ): NumericSeriesExtraction {
    const fieldIndex = this.fieldIndex(field)
    const budget = Math.max(0, Math.floor(maxPoints))
    if (this._length === 0 || budget === 0) {
      return { points: [], segments: [], lod: false }
    }

    const from = Math.max(0, Math.min(Math.floor(start), this._length - 1))
    const to = Math.max(from, Math.min(Math.floor(end), this._length - 1))
    let finiteCount = 0
    for (let index = from; index <= to; index += 1) {
      if (Number.isFinite(this.rawValue(fieldIndex, index))) finiteCount += 1
    }
    if (finiteCount === 0) return { points: [], segments: [], lod: false }

    const lod = finiteCount > budget
    const selected = lod
      ? this.decimate(fieldIndex, from, to, budget)
      : this.collectFiniteIndices(fieldIndex, from, to)
    const points: number[] = []
    for (const index of selected) points.push(index, this.rawValue(fieldIndex, index))

    const segments: number[] = []
    if (selected.length > 0) {
      let segmentStart = 0
      let segmentLength = 1
      for (let point = 1; point < selected.length; point += 1) {
        const previous = selected[point - 1]
        const current = selected[point]
        const connected = lod
          ? !this.hasBreakBetween(fieldIndex, previous, current)
          : current === previous + 1 && !this.isGap(current)
        if (connected) {
          segmentLength += 1
        } else {
          segments.push(segmentStart, segmentLength)
          segmentStart = point
          segmentLength = 1
        }
      }
      segments.push(segmentStart, segmentLength)
    }

    return { points, segments, lod }
  }

  private collectFiniteIndices(fieldIndex: number, from: number, to: number): number[] {
    const result: number[] = []
    for (let index = from; index <= to; index += 1) {
      if (Number.isFinite(this.rawValue(fieldIndex, index))) result.push(index)
    }
    return result
  }

  private decimate(fieldIndex: number, from: number, to: number, budget: number): number[] {
    let first = -1
    let last = -1
    for (let index = from; index <= to; index += 1) {
      if (Number.isFinite(this.rawValue(fieldIndex, index))) {
        first = index
        break
      }
    }
    for (let index = to; index >= from; index -= 1) {
      if (Number.isFinite(this.rawValue(fieldIndex, index))) {
        last = index
        break
      }
    }
    if (first < 0 || budget <= 0) return []
    if (budget === 1 || first === last) return [first]
    if (budget === 2) return [first, last]

    if (budget === 3) {
      const baseline = (this.rawValue(fieldIndex, first) + this.rawValue(fieldIndex, last)) / 2
      let extreme = -1
      let largestDeviation = -1
      for (let index = first + 1; index < last; index += 1) {
        const value = this.rawValue(fieldIndex, index)
        if (!Number.isFinite(value)) continue
        const deviation = Math.abs(value - baseline)
        if (deviation > largestDeviation) {
          extreme = index
          largestDeviation = deviation
        }
      }
      return extreme < 0 ? [first, last] : [first, extreme, last]
    }

    const selected = new Set<number>([first, last])
    const interiorStart = first + 1
    const interiorLength = Math.max(0, last - interiorStart)
    const bucketCount = Math.max(1, Math.floor((budget - 2) / 2))

    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const bucketStart = interiorStart + Math.floor((interiorLength * bucket) / bucketCount)
      const bucketEnd = interiorStart + Math.floor((interiorLength * (bucket + 1)) / bucketCount)
      let minimum = Infinity
      let maximum = -Infinity
      let minimumIndex = -1
      let maximumIndex = -1

      for (let index = bucketStart; index < bucketEnd; index += 1) {
        const value = this.rawValue(fieldIndex, index)
        if (!Number.isFinite(value)) continue
        if (value < minimum) {
          minimum = value
          minimumIndex = index
        }
        if (value > maximum) {
          maximum = value
          maximumIndex = index
        }
      }
      if (minimumIndex >= 0) selected.add(minimumIndex)
      if (maximumIndex >= 0) selected.add(maximumIndex)
    }

    return [...selected].sort((left, right) => left - right)
  }

  /** Return finite extrema over the inclusive range, or `null` when empty. */
  public getRange(field: string, start: number, end: number): NumericRange | null {
    const fieldIndex = this.fieldIndex(field)
    if (this._length === 0) return null
    const from = Math.max(0, Math.min(Math.floor(start), this._length - 1))
    const to = Math.max(from, Math.min(Math.floor(end), this._length - 1))
    let min = Infinity
    let max = -Infinity
    for (let index = from; index <= to; index += 1) {
      const value = this.rawValue(fieldIndex, index)
      if (!Number.isFinite(value)) continue
      if (value < min) min = value
      if (value > max) max = value
    }
    return min === Infinity ? null : { min, max }
  }
}
