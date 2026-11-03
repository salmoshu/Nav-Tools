import { describe, expect, it } from 'vitest'
import {
  clampViewportCenter,
  equalizeViewportScale,
  clampVisibleSpan,
  fitDeviationPoints,
  fitDeviationPointsAroundCenter,
  GNSS_MIN_VISIBLE_SPAN_METERS,
} from '@/core/deviation/DeviationViewport'

describe('GNSS deviation viewport', () => {
  it('limits maximum zoom to a 0.05 cm visible span', () => {
    expect(GNSS_MIN_VISIBLE_SPAN_METERS).toBe(0.0005)
    expect(clampVisibleSpan(0.00001)).toBe(0.0005)
    expect(clampVisibleSpan(0.2)).toBe(0.2)
  })

  it('fits every trajectory point with padding and equal display scale', () => {
    const viewport = fitDeviationPoints(
      [
        [-2, -1],
        [4, 3],
        [1, 2],
      ],
      2,
    )

    expect(viewport).toBeDefined()
    expect(viewport!.xMin).toBeLessThan(-2)
    expect(viewport!.xMax).toBeGreaterThan(4)
    expect(viewport!.yMin).toBeLessThan(-1)
    expect(viewport!.yMax).toBeGreaterThan(3)
    expect((viewport!.xMax - viewport!.xMin) / (viewport!.yMax - viewport!.yMin)).toBeCloseTo(2)
  })

  it('keeps the latest tracking point centered while fitting every point', () => {
    const viewport = fitDeviationPointsAroundCenter(
      [
        [-8, -1],
        [2, 3],
        [0, 0],
      ],
      0,
      0,
      2,
    )

    expect(viewport).toBeDefined()
    expect(viewport!.xMin).toBeCloseTo(-viewport!.xMax)
    expect(viewport!.yMin).toBeCloseTo(-viewport!.yMax)
    expect(viewport!.xMin).toBeLessThan(-8)
    expect(viewport!.xMax).toBeGreaterThan(2)
    expect(viewport!.yMin).toBeLessThan(-1)
    expect(viewport!.yMax).toBeGreaterThan(3)
    expect((viewport!.xMax - viewport!.xMin) / (viewport!.yMax - viewport!.yMin)).toBeCloseTo(2)
  })

  it('equalizeViewportScale only grows the smaller-scale axis and keeps the center', () => {
    // 容器 2:1 而视口 1:1：x 跨度应放大到 2 倍 y 跨度（只放大不缩小），中心不动
    const next = equalizeViewportScale({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, 2)
    expect(next.xMax - next.xMin).toBeCloseTo(2 * (next.yMax - next.yMin))
    expect((next.xMin + next.xMax) / 2).toBeCloseTo(0)
    expect((next.yMin + next.yMax) / 2).toBeCloseTo(0)
    expect(next.yMin).toBeCloseTo(-1)
    expect(next.yMax).toBeCloseTo(1)

    // 已经等比例的视口原样返回
    const kept = equalizeViewportScale({ xMin: -2, xMax: 2, yMin: -1, yMax: 1 }, 2)
    expect(kept.xMin).toBeCloseTo(-2)
    expect(kept.xMax).toBeCloseTo(2)
    expect(kept.yMin).toBeCloseTo(-1)
    expect(kept.yMax).toBeCloseTo(1)
  })

  it('clampViewportCenter moves only the center so the span ratio survives', () => {
    // 视口整体超出 ±limit：中心被钳回，x/y 跨度保持不变（等比例不被逐端钳制破坏）
    const clamped = clampViewportCenter({ xMin: 9999, xMax: 10001, yMin: 9999, yMax: 10001 }, 10000)
    expect(clamped.xMax - clamped.xMin).toBeCloseTo(2)
    expect(clamped.yMax - clamped.yMin).toBeCloseTo(2)
    expect((clamped.xMin + clamped.xMax) / 2).toBeCloseTo(9999)
    expect((clamped.yMin + clamped.yMax) / 2).toBeCloseTo(10000 - 1)

    // 视口在限内：原样返回
    const inside = clampViewportCenter({ xMin: -5, xMax: 5, yMin: -3, yMax: 3 }, 10000)
    expect(inside.xMin).toBeCloseTo(-5)
    expect(inside.xMax).toBeCloseTo(5)

    // 跨度达到 2×limit：中心归零，不再平移
    const oversized = clampViewportCenter({ xMin: -10005, xMax: 10005, yMin: -1, yMax: 1 }, 10000)
    expect((oversized.xMin + oversized.xMax) / 2).toBeCloseTo(0)
  })
})
