export interface QualitySeriesGeometry {
  points: number[]
  segments: number[]
}

interface MutableQualitySeriesGeometry extends QualitySeriesGeometry {
  lastSourceSegment: number
  lastSourceVertex: number
}

/**
 * Splits line geometry into fixed-color series. Each source edge is assigned to
 * the quality of its destination epoch, matching the GNSS map track semantics.
 */
export function splitSeriesByQuality(
  points: ArrayLike<number>,
  segments: ArrayLike<number>,
  qualityAt: (epochIndex: number) => number,
): Map<number, QualitySeriesGeometry> {
  const buckets = new Map<number, MutableQualitySeriesGeometry>()
  const pointCount = Math.floor(points.length / 2)

  for (let segmentOffset = 0; segmentOffset + 1 < segments.length; segmentOffset += 2) {
    const sourceSegment = segmentOffset / 2
    const start = Math.max(0, Math.floor(segments[segmentOffset]))
    const count = Math.max(0, Math.floor(segments[segmentOffset + 1]))
    const end = Math.min(pointCount, start + count)

    for (let vertex = start + 1; vertex < end; vertex += 1) {
      const previousOffset = (vertex - 1) * 2
      const currentOffset = vertex * 2
      const previousX = points[previousOffset]
      const previousY = points[previousOffset + 1]
      const currentX = points[currentOffset]
      const currentY = points[currentOffset + 1]
      if (
        !Number.isFinite(previousX) ||
        !Number.isFinite(previousY) ||
        !Number.isFinite(currentX) ||
        !Number.isFinite(currentY)
      ) {
        continue
      }

      const quality = qualityAt(Math.round(currentX))
      let bucket = buckets.get(quality)
      if (!bucket) {
        bucket = {
          points: [],
          segments: [],
          lastSourceSegment: -1,
          lastSourceVertex: -1,
        }
        buckets.set(quality, bucket)
      }

      const canExtend =
        bucket.lastSourceSegment === sourceSegment && bucket.lastSourceVertex === vertex - 1
      if (canExtend) {
        bucket.points.push(currentX, currentY)
        bucket.segments[bucket.segments.length - 1] += 1
      } else {
        const bucketStart = bucket.points.length / 2
        bucket.points.push(previousX, previousY, currentX, currentY)
        bucket.segments.push(bucketStart, 2)
      }
      bucket.lastSourceSegment = sourceSegment
      bucket.lastSourceVertex = vertex
    }
  }

  return new Map(
    Array.from(buckets, ([quality, bucket]) => [
      quality,
      { points: bucket.points, segments: bucket.segments },
    ]),
  )
}
