import { describe, expect, it } from 'vitest'
import { createTrackSimplifier, type TrackProjector } from '@/core/gnss/TrackSimplification'

/** 线性投影：经度 → x、纬度 → y（像素比例 1:1），便于手算距离 */
const identityProject: TrackProjector = (lat, lng) => ({ x: lng, y: lat })

describe('createTrackSimplifier', () => {
  it('always keeps the first point after reset', () => {
    const simplifier = createTrackSimplifier(2, identityProject)
    expect(simplifier.test(0, 0)).toBe(true)
    expect(simplifier.last()).toEqual({ lat: 0, lng: 0 })
    simplifier.reset()
    expect(simplifier.last()).toBeNull()
    expect(simplifier.test(5, 5)).toBe(true)
  })

  it('skips points closer than the pixel threshold and keeps the anchor unchanged', () => {
    const simplifier = createTrackSimplifier(2, identityProject)
    simplifier.test(0, 0)
    // 距离 1.4 < 2：跳过，基准仍是原点
    expect(simplifier.test(1, 1)).toBe(false)
    expect(simplifier.last()).toEqual({ lat: 0, lng: 0 })
    // 距离 3 ≥ 2：保留并成为新基准
    expect(simplifier.test(3, 0)).toBe(true)
    expect(simplifier.last()).toEqual({ lat: 3, lng: 0 })
  })

  it('renders a bounded share of points for a dense diagonal stream', () => {
    const simplifier = createTrackSimplifier(2, identityProject)
    let kept = 0
    // 每步移动 ~0.85 px（< 2 px 阈值）：平均每 3 步才保留一个点
    for (let step = 0; step < 3000; step += 1) {
      if (simplifier.test(step * 0.6, step * 0.6)) kept += 1
    }
    expect(kept).toBeLessThan(1200)
    expect(kept).toBeGreaterThan(800)
  })

  it('replace moves the anchor only when it matches the replaced tail point', () => {
    const simplifier = createTrackSimplifier(2, identityProject)
    simplifier.test(0, 0)
    simplifier.test(10, 0)
    // 基准是 (10,0)：替换同历元尾点 (10,0) → (10.5, 0.2) 时基准同步
    simplifier.replace({ lat: 10, lng: 0 }, { lat: 10.5, lng: 0.2 })
    expect(simplifier.last()).toEqual({ lat: 10.5, lng: 0.2 })
    // 替换的不是基准点：基准不动
    simplifier.replace({ lat: 0, lng: 0 }, { lat: 99, lng: 99 })
    expect(simplifier.last()).toEqual({ lat: 10.5, lng: 0.2 })
  })

  it('treats a non-positive threshold as 1 pixel', () => {
    const simplifier = createTrackSimplifier(Number.NaN, identityProject)
    simplifier.test(0, 0)
    expect(simplifier.test(0.5, 0)).toBe(false)
    expect(simplifier.test(1, 0)).toBe(true)
  })
})
