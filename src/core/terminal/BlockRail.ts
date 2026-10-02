/**
 * 终端命令块预览导航条（zcode 对话预览条同款交互）的纯逻辑部分。
 * 视图侧只负责收集各块相对视口的位置并调用这里的定位函数。
 */

/**
 * 「当前块」定位：锚线（视口顶部向下 anchor 偏移）之上最后一个块的下标。
 * offsetTops 为各块上边缘的纵坐标（与 anchor 同一坐标系，递增）；
 * 全部块都在锚线之下时返回 0，无块返回 -1。
 */
export function railAnchorIndex(offsetTops: readonly number[], anchor: number): number {
  if (offsetTops.length === 0) return -1
  let active = 0
  for (let i = 0; i < offsetTops.length; i++) {
    if (offsetTops[i] <= anchor) active = i
    else break
  }
  return active
}

/** 预览条高度内建议的最小条目数参考：条目行高（px），供样式与测试对齐 */
export const RAIL_ENTRY_HEIGHT_PX = 24
