// 位置/速度图（GnssMetricTimeSeries）间的 x 视口广播通道。
// 必须放在真正的模块作用域（而非 <script setup> 顶层——那里每个组件实例
// 都会重新执行，Set 会变成三份只含自己的实例，广播永远到不了其他图表）。
// 同一数据源（position/speed store）的图表间联动：左键平移与右键 x 伸缩
// 广播给同源实例——位置视图下 E/N/U 三轴同步移动/伸缩。

export interface MetricViewportBroadcast {
  start: number
  end: number
  /** 数据源身份：不同 store（position vs speed）的图表互不干扰 */
  store: unknown
}

export type MetricViewportListener = (payload: MetricViewportBroadcast) => void

const listeners = new Set<MetricViewportListener>()

export function broadcastMetricViewport(start: number, end: number, store: unknown): void {
  for (const listener of listeners) listener({ start, end, store })
}

/** 订阅广播，返回取消订阅函数（组件 onUnmounted 调用） */
export function subscribeMetricViewport(listener: MetricViewportListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
