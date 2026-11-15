export interface MetricOverlaySample {
  timeMs: number
  value: number | null
  quality: number
}

export interface MetricOverlayGeometry {
  points: number[]
  segments: number[]
}

export interface MetricOverlayProjection {
  byQuality: Map<number, MetricOverlayGeometry>
  range: { min: number; max: number } | null
}

/** 在有序时间戳中查找最近项；空序列或无效时间返回 -1。 */
export function findNearestTimeIndex(times: ArrayLike<number>, timeMs: number): number {
  if (times.length === 0 || !Number.isFinite(timeMs)) return -1
  let low = 0
  let high = times.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (times[middle] < timeMs) low = middle + 1
    else high = middle
  }
  if (low === 0) return 0
  return Math.abs(times[low] - timeMs) < Math.abs(times[low - 1] - timeMs) ? low : low - 1
}

/** 参考序列已按 timeMs 排序时，以二分查找取得同历元的最近样本。 */
export function findNearestMetricOverlaySample(
  samples: readonly MetricOverlaySample[],
  timeMs: number,
): { sample: MetricOverlaySample; index: number } | null {
  if (samples.length === 0 || !Number.isFinite(timeMs)) return null
  let low = 0
  let high = samples.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (samples[middle].timeMs < timeMs) low = middle + 1
    else high = middle
  }
  const previous = Math.max(0, low - 1)
  const index =
    Math.abs(samples[low].timeMs - timeMs) < Math.abs(samples[previous].timeMs - timeMs)
      ? low
      : previous
  return { sample: samples[index], index }
}

export function fractionalEpochIndex(times: ArrayLike<number>, timeMs: number): number | null {
  if (times.length === 0) return null
  if (times.length === 1) return 0

  const interval = (left: number, right: number): number => {
    const span = times[right] - times[left]
    return left + (span === 0 ? 0 : (timeMs - times[left]) / span)
  }
  if (timeMs < times[0]) return interval(0, 1)
  if (timeMs >= times[times.length - 1]) return interval(times.length - 2, times.length - 1)

  let low = 0
  let high = times.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (times[middle] <= timeMs) low = middle
    else high = middle
  }
  return interval(low, high)
}

interface ProjectedSample {
  sourceIndex: number
  x: number
  value: number
  quality: number
}

interface MutableOverlayGeometry extends MetricOverlayGeometry {
  lastSourceIndex: number
}

/**
 * Project samples onto the primary epoch-index axis without assuming equal sampling rates.
 * Lines always join chronological neighbours. At a quality transition the edge belongs to
 * the destination epoch, matching the main track instead of connecting FIX to the next FIX.
 */
export function projectMetricOverlay(
  primaryTimes: ArrayLike<number>,
  samples: readonly MetricOverlaySample[],
  timeOffsetMs: number,
  start: number,
  end: number,
): MetricOverlayProjection {
  const byQuality = new Map<number, MutableOverlayGeometry>()
  let previous: ProjectedSample | null = null
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  const ordered = samples
    .map((sample, index) => ({ sample, index }))
    .sort((left, right) => left.sample.timeMs - right.sample.timeMs || left.index - right.index)

  for (const [orderedIndex, { sample }] of ordered.entries()) {
    const x = fractionalEpochIndex(primaryTimes, sample.timeMs + timeOffsetMs)
    if (
      x === null ||
      sample.value === null ||
      !Number.isFinite(sample.value) ||
      !Number.isFinite(x)
    ) {
      previous = null
      continue
    }

    const current: ProjectedSample = {
      sourceIndex: orderedIndex,
      x,
      value: sample.value,
      quality: Number.isFinite(sample.quality) ? sample.quality : 0,
    }
    if (x >= start - 0.5 && x <= end - 0.5) {
      minimum = Math.min(minimum, current.value)
      maximum = Math.max(maximum, current.value)
    }

    // Keep one off-screen neighbour so an edge can cross the viewport boundary.
    if (x < start - 1 || x > end + 1) {
      previous = current
      continue
    }

    let geometry = byQuality.get(current.quality)
    if (!geometry) {
      geometry = { points: [], segments: [], lastSourceIndex: -1 }
      byQuality.set(current.quality, geometry)
    }

    if (previous && geometry.lastSourceIndex === orderedIndex - 1) {
      geometry.points.push(current.x, current.value)
      geometry.segments[geometry.segments.length - 1] += 1
    } else if (previous) {
      const segmentStart = geometry.points.length / 2
      geometry.points.push(previous.x, previous.value, current.x, current.value)
      geometry.segments.push(segmentStart, 2)
    } else {
      // Preserve isolated samples as points even when there is no line to draw.
      geometry.points.push(current.x, current.value)
      geometry.segments.push(geometry.points.length / 2 - 1, 1)
    }
    geometry.lastSourceIndex = orderedIndex
    previous = current
  }

  return {
    byQuality: new Map(
      Array.from(byQuality, ([quality, geometry]) => [
        quality,
        { points: geometry.points, segments: geometry.segments },
      ]),
    ),
    range:
      Number.isFinite(minimum) && Number.isFinite(maximum) ? { min: minimum, max: maximum } : null,
  }
}
