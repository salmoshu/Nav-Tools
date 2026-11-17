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

export const AZIMUTH_SNAP_THRESHOLD_DEG = 1.5
export const AZIMUTH_SNAP_STEP_DEG = 5

/**
 * 拖拽原始位置靠近 5° 倍数时吸附，松开时可强制落到最近的 5° 倍数。
 * 整体平移分别吸附起止端点并限制在全局范围内；单边调整只修改当前端点。
 */
export function snapAzimuthDrag(
  min: number,
  max: number,
  kind: 'move' | 'min' | 'max',
  force = false,
): AzimuthRange {
  const low = clampAzimuth(Math.min(min, max))
  const high = clampAzimuth(Math.max(min, max))
  if (kind === 'move') {
    const lowTarget = Math.round(low / AZIMUTH_SNAP_STEP_DEG) * AZIMUTH_SNAP_STEP_DEG
    const highTarget = Math.round(high / AZIMUTH_SNAP_STEP_DEG) * AZIMUTH_SNAP_STEP_DEG
    return {
      min: force || Math.abs(low - lowTarget) <= AZIMUTH_SNAP_THRESHOLD_DEG ? lowTarget : low,
      max: force || Math.abs(high - highTarget) <= AZIMUTH_SNAP_THRESHOLD_DEG ? highTarget : high,
    }
  }
  const value = kind === 'min' ? low : high
  const target = Math.round(value / AZIMUTH_SNAP_STEP_DEG) * AZIMUTH_SNAP_STEP_DEG
  const snapped = force || Math.abs(value - target) <= AZIMUTH_SNAP_THRESHOLD_DEG ? target : value
  return resizeAzimuthRange(low, high, kind, snapped)
}
