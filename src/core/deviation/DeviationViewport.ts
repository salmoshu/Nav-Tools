export const GNSS_MIN_VISIBLE_SPAN_METERS = 0.0005

export interface DeviationViewport {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export function clampVisibleSpan(
  span: number,
  minimum = GNSS_MIN_VISIBLE_SPAN_METERS,
  maximum = Number.POSITIVE_INFINITY,
): number {
  if (!Number.isFinite(span)) return minimum
  return Math.min(maximum, Math.max(minimum, Math.abs(span)))
}

export function fitDeviationPoints(
  points: readonly (readonly unknown[])[],
  aspectRatio = 1,
  minimumSpan = GNSS_MIN_VISIBLE_SPAN_METERS,
  marginRatio = 0.08,
): DeviationViewport | undefined {
  let xMin = Number.POSITIVE_INFINITY
  let xMax = Number.NEGATIVE_INFINITY
  let yMin = Number.POSITIVE_INFINITY
  let yMax = Number.NEGATIVE_INFINITY

  for (const point of points) {
    const x = Number(point[0])
    const y = Number(point[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    xMin = Math.min(xMin, x)
    xMax = Math.max(xMax, x)
    yMin = Math.min(yMin, y)
    yMax = Math.max(yMax, y)
  }
  if (!Number.isFinite(xMin)) return undefined

  const xCenter = (xMin + xMax) / 2
  const yCenter = (yMin + yMax) / 2
  const marginScale = 1 + Math.max(0, marginRatio) * 2
  let xSpan = Math.max(minimumSpan, (xMax - xMin) * marginScale)
  let ySpan = Math.max(minimumSpan, (yMax - yMin) * marginScale)
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1

  if (xSpan / ySpan > safeAspectRatio) ySpan = xSpan / safeAspectRatio
  else xSpan = ySpan * safeAspectRatio

  return {
    xMin: xCenter - xSpan / 2,
    xMax: xCenter + xSpan / 2,
    yMin: yCenter - ySpan / 2,
    yMax: yCenter + ySpan / 2,
  }
}

export function fitDeviationPointsAroundCenter(
  points: readonly (readonly unknown[])[],
  centerX = 0,
  centerY = 0,
  aspectRatio = 1,
  minimumSpan = GNSS_MIN_VISIBLE_SPAN_METERS,
  marginRatio = 0.08,
): DeviationViewport | undefined {
  let halfWidth = 0
  let halfHeight = 0
  let hasPoint = false

  for (const point of points) {
    const x = Number(point[0])
    const y = Number(point[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    halfWidth = Math.max(halfWidth, Math.abs(x - centerX))
    halfHeight = Math.max(halfHeight, Math.abs(y - centerY))
    hasPoint = true
  }
  if (!hasPoint) return undefined

  const marginScale = 1 + Math.max(0, marginRatio)
  halfWidth = Math.max(minimumSpan / 2, halfWidth * marginScale)
  halfHeight = Math.max(minimumSpan / 2, halfHeight * marginScale)
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1

  if (halfWidth / halfHeight > safeAspectRatio) halfHeight = halfWidth / safeAspectRatio
  else halfWidth = halfHeight * safeAspectRatio

  return {
    xMin: centerX - halfWidth,
    xMax: centerX + halfWidth,
    yMin: centerY - halfHeight,
    yMax: centerY + halfHeight,
  }
}
