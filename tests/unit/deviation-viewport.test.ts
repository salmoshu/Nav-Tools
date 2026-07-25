import { describe, expect, it } from 'vitest'
import {
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
})
