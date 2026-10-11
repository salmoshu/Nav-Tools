/**
 * 窗格操作栏手柄的交互判定(纯逻辑,可单测)。
 *
 * 手柄身兼两职,靠时序与位移区分:
 * - 单击(按下-抬起,位移在阈值内,未达长按时长)= 切换操作栏折叠;
 * - 长按(按住超过阈值)= 进入拖拽,锚点保持在按下点——长按期间的位移在激活瞬间
 *   一次性生效(立即跟上指针),此后按指针位移 1:1 更新操作栏偏移;
 * - 未达长按就抬起且位移超阈值(快速甩动):既不是点击也不是拖拽,不产生任何动作。
 *
 * 计时器由组件持有(到点调用 activateGripDrag),本模块只管状态与判定。
 */

/** 长按进入拖拽的时长阈值 */
export const GRIP_LONG_PRESS_MS = 350
/** 点击允许的最大位移(覆盖手抖与鼠标微动) */
export const GRIP_CLICK_SLOP_PX = 6

export interface GripPress {
  pointerId: number
  /** 按下点坐标:点击位移的判定基准,全程不变 */
  readonly originX: number
  readonly originY: number
  /** 最近一次指针纵坐标:保留给交互诊断,拖拽锚点不随它移动 */
  lastY: number
  /** 长按是否已激活拖拽 */
  dragging: boolean
  /** 拖拽锚点:按下点的纵坐标与按下时的操作栏偏移(全程不变) */
  anchorY: number
  anchorOffset: number
}

export function beginGripPress(pointerId: number, x: number, y: number, offset: number): GripPress {
  return {
    pointerId,
    originX: x,
    originY: y,
    lastY: y,
    dragging: false,
    anchorY: y,
    anchorOffset: offset,
  }
}

/** 每次 pointermove 记录最新位置;不判断是否该拖拽,激活与否由 dragging 标记决定 */
export function trackGripMove(press: GripPress, y: number): void {
  press.lastY = y
}

/** 长按计时到点:激活拖拽。锚点保持按下点,长按窗口内积累的位移立即生效——
 * 否则用户按住并拖动一段距离后操作栏仍停在原位,感觉「不跟手」。 */
export function activateGripDrag(press: GripPress): void {
  press.dragging = true
}

/** 拖拽中的目标偏移:以锚点为基准累加位移,并夹在 [0, max] 内 */
export function gripDragOffset(press: GripPress, y: number, max: number): number {
  const next = press.anchorOffset + y - press.anchorY
  return Math.min(Math.max(0, max), Math.max(0, next))
}

/** 抬起时判定是否为单击:未曾进入拖拽,且全程位移在阈值内 */
export function isGripClick(press: GripPress, x: number, y: number): boolean {
  if (press.dragging) return false
  return (
    Math.abs(x - press.originX) <= GRIP_CLICK_SLOP_PX &&
    Math.abs(y - press.originY) <= GRIP_CLICK_SLOP_PX
  )
}
