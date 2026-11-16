export const AZIMUTH_MIN_DEG = -180
export const AZIMUTH_MAX_DEG = 180

export interface AzimuthRange {
  min: number
  max: number
}

function roundAngle(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

export function clampAzimuth(value: number): number {
  return roundAngle(Math.min(AZIMUTH_MAX_DEG, Math.max(AZIMUTH_MIN_DEG, value)))
}

/** 将圆周上相邻两次指针位置的差值归入 [-180, 180)，避免跨越 ±180° 时跳变。 */
export function normalizeAzimuthDelta(delta: number): number {
  return ((((delta + 180) % 360) + 360) % 360) - 180
}

/** 平移整个扇区；碰到全局边界时停止，扇区跨度保持不变。 */
export function shiftAzimuthRange(min: number, max: number, delta: number): AzimuthRange {
  const low = clampAzimuth(Math.min(min, max))
  const high = clampAzimuth(Math.max(min, max))
  const appliedDelta = Math.min(AZIMUTH_MAX_DEG - high, Math.max(AZIMUTH_MIN_DEG - low, delta))
  return {
    min: roundAngle(low + appliedDelta),
    max: roundAngle(high + appliedDelta),
  }
}

/** 调整一个端点；端点不能越过另一个端点或全局边界。 */
export function resizeAzimuthRange(
  min: number,
  max: number,
  edge: 'min' | 'max',
  value: number,
): AzimuthRange {
  const low = clampAzimuth(Math.min(min, max))
  const high = clampAzimuth(Math.max(min, max))
  const next = clampAzimuth(value)
  return edge === 'min'
    ? { min: Math.min(next, high), max: high }
    : { min: low, max: Math.max(next, low) }
}
