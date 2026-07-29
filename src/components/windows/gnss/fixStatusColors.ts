// GNSS 解状态（GGA quality 字段）颜色映射，GnssDeviation / GnssMap 共用。
// 0：无效解；1：单点定位解；2：伪距差分；4：固定解；5：浮动解。
export const FIX_STATUS_COLORS: Readonly<Record<number, string>> = {
  0: '#808080', // Invalid 无效解（grey）
  1: '#ff0000', // Single 单点定位（red）
  2: '#0000ff', // DGNSS 伪距差分（blue）
  4: '#008000', // Fix 固定解（green）
  5: '#ffa500', // Float 浮动解（orange）
}

export const DEFAULT_FIX_STATUS_COLOR = '#808080'

export const FIX_STATUS_QUALITIES = [0, 1, 2, 4, 5] as const
export type FixStatusQuality = (typeof FIX_STATUS_QUALITIES)[number]

export function normalizeFixStatusQuality(quality: number | null): FixStatusQuality {
  return FIX_STATUS_QUALITIES.includes(quality as FixStatusQuality)
    ? (quality as FixStatusQuality)
    : 0
}

export function fixStatusColor(quality: number): string {
  return FIX_STATUS_COLORS[quality] ?? DEFAULT_FIX_STATUS_COLOR
}

// 供 canvas 渲染器使用的 0-1 归一化 RGB 分量
export function fixStatusColorRgb01(quality: number): [number, number, number] {
  const hex = fixStatusColor(quality)
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ]
}
