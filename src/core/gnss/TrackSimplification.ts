// 地图轨迹像素密度抽稀：屏幕上无法与上一渲染点区分（距离小于阈值像素）的
// 采样点跳过渲染，使渲染层点数受屏幕密度约束而非源数据长度约束——
// 长时间录制回放（几十万点）时 Leaflet 重绘开销保持恒定，视图不卡顿。
// 逻辑轨迹仍完整保留在数据源中，缩放级别变化后由调用方全量重建（按新
// 精度重放抽稀），放大时补回细节。纯逻辑，投影函数由调用方注入，可单测。

export interface ProjectedPoint {
  x: number
  y: number
}

/** 经纬度 → 指定缩放级别的像素坐标（如 Leaflet map.project） */
export type TrackProjector = (lat: number, lng: number) => ProjectedPoint

export interface TrackSimplifierState {
  lat: number
  lng: number
}

export interface TrackSimplifier {
  /** 轨迹重建时清空基准点 */
  reset(): void
  /**
   * 判定新采样点是否值得渲染：与上一渲染点的屏幕距离 ≥ minPixels 才保留，
   * 保留时该点成为新的基准；首点总是保留。
   */
  test(lat: number, lng: number): boolean
  /** 尾点被同历元样本替换（RMC→GGA 合并）且该尾点正是基准点时，同步基准坐标 */
  replace(previous: TrackSimplifierState, next: TrackSimplifierState): void
  /** 上一渲染基准点（无则 null） */
  last(): TrackSimplifierState | null
}

export function createTrackSimplifier(minPixels: number, project: TrackProjector): TrackSimplifier {
  const safeMinPixels = Number.isFinite(minPixels) && minPixels > 0 ? minPixels : 1
  let anchor: TrackSimplifierState | null = null

  return {
    reset(): void {
      anchor = null
    },
    test(lat: number, lng: number): boolean {
      if (!anchor) {
        anchor = { lat, lng }
        return true
      }
      const from = project(anchor.lat, anchor.lng)
      const to = project(lat, lng)
      if (Math.hypot(to.x - from.x, to.y - from.y) < safeMinPixels) return false
      anchor = { lat, lng }
      return true
    },
    replace(previous: TrackSimplifierState, next: TrackSimplifierState): void {
      if (anchor && anchor.lat === previous.lat && anchor.lng === previous.lng) {
        anchor = { lat: next.lat, lng: next.lng }
      }
    },
    last(): TrackSimplifierState | null {
      return anchor ? { ...anchor } : null
    },
  }
}
