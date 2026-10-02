import { describe, expect, it } from 'vitest'
import { railAnchorIndex } from '../../src/core/terminal/BlockRail'

describe('railAnchorIndex 预览条当前块定位', () => {
  it('无块时返回 -1', () => {
    expect(railAnchorIndex([], 100)).toBe(-1)
  })

  it('锚线之上取最后一个块', () => {
    const tops = [10, 90, 170, 250]
    expect(railAnchorIndex(tops, 200)).toBe(2)
    expect(railAnchorIndex(tops, 169)).toBe(1)
    expect(railAnchorIndex(tops, 170)).toBe(2) // 上边缘恰好贴线算命中
  })

  it('全部块都在锚线之下时返回首块', () => {
    expect(railAnchorIndex([500, 600], 100)).toBe(0)
  })

  it('锚线越过全部块时返回末块（吸底状态）', () => {
    expect(railAnchorIndex([10, 90, 170], 9999)).toBe(2)
  })
})
