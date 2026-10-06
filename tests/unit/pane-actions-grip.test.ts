import { describe, expect, it } from 'vitest'
import {
  activateGripDrag,
  beginGripPress,
  GRIP_CLICK_SLOP_PX,
  gripDragOffset,
  isGripClick,
  trackGripMove,
} from '@/core/terminal/PaneActionsGrip'

describe('PaneActionsGrip 单击/长按判定', () => {
  it('按下后在阈值内抬起是单击(切换折叠)', () => {
    const press = beginGripPress(1, 50, 100, 0)
    trackGripMove(press, 102)
    expect(isGripClick(press, 51, 102)).toBe(true)
  })

  it('位移超过阈值不是单击', () => {
    const press = beginGripPress(1, 50, 100, 0)
    expect(isGripClick(press, 50, 100 + GRIP_CLICK_SLOP_PX + 1)).toBe(false)
    expect(isGripClick(press, 50 + GRIP_CLICK_SLOP_PX + 1, 100)).toBe(false)
  })

  it('长按激活后不再是单击,即使原位抬起', () => {
    const press = beginGripPress(1, 50, 100, 0)
    activateGripDrag(press, 0)
    expect(isGripClick(press, 50, 100)).toBe(false)
  })

  it('快速甩动(未长按、位移大、抬起)既不是单击也不产生拖拽', () => {
    const press = beginGripPress(1, 50, 100, 0)
    trackGripMove(press, 160)
    expect(press.dragging).toBe(false)
    expect(isGripClick(press, 50, 160)).toBe(false)
  })
})

describe('PaneActionsGrip 拖拽偏移', () => {
  it('长按激活时锚点对齐当前指针位置,激活瞬间不跳变', () => {
    const press = beginGripPress(1, 50, 100, 30)
    // 按住期间指针已滑到 140(尚未激活,不产生位移)
    trackGripMove(press, 140)
    activateGripDrag(press, 30)
    expect(gripDragOffset(press, 140, 500)).toBe(30)
    // 激活后继续移动,从锚点累加
    expect(gripDragOffset(press, 170, 500)).toBe(60)
  })

  it('偏移夹在 [0, max] 之间', () => {
    const press = beginGripPress(1, 50, 100, 20)
    activateGripDrag(press, 20)
    expect(gripDragOffset(press, -500, 200)).toBe(0)
    expect(gripDragOffset(press, 5000, 200)).toBe(200)
  })

  it('不同 pointerId 的按下各自独立(组件按 pointerId 匹配)', () => {
    const first = beginGripPress(1, 0, 0, 0)
    const second = beginGripPress(2, 0, 0, 0)
    activateGripDrag(first, 0)
    expect(first.dragging).toBe(true)
    expect(second.dragging).toBe(false)
  })
})
