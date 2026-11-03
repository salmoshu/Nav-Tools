import { describe, expect, it } from 'vitest'
import { computeDeviationStats } from '@/core/deviation/DeviationStats'

describe('computeDeviationStats', () => {
  it('returns null for empty input or all-invalid coordinates', () => {
    expect(computeDeviationStats([])).toBeNull()
    expect(
      computeDeviationStats([
        [Number.NaN, 1, 4],
        [1, Number.POSITIVE_INFINITY, 4],
      ]),
    ).toBeNull()
  })

  it('computes AVE/STD/RMS with rtkplot semantics (RMS against zero)', () => {
    // E: [3, 4] -> ave 3.5, std 0.5, rms 3.5355…; N: [0, 0] -> 全 0
    const stats = computeDeviationStats([
      [3, 0, 4],
      [4, 0, 5],
    ])
    expect(stats).not.toBeNull()
    expect(stats!.count).toBe(2)
    expect(stats!.aveE).toBeCloseTo(3.5, 12)
    expect(stats!.stdE).toBeCloseTo(0.5, 12)
    expect(stats!.rmsE).toBeCloseTo(Math.sqrt(12.5), 12)
    expect(stats!.aveN).toBe(0)
    expect(stats!.stdN).toBe(0)
    expect(stats!.rmsN).toBe(0)
  })

  it('computes doubled 2D RMS as 2 × sqrt(mean(E²+N²))', () => {
    const stats = computeDeviationStats([
      [3, 4, 4],
      [0, 0, 4],
    ])
    // mean(E²+N²) = (25 + 0) / 2 = 12.5
    expect(stats!.rms2dDoubled).toBeCloseTo(2 * Math.sqrt(12.5), 12)
  })

  it('counts quality distribution only for encountered qualities', () => {
    const stats = computeDeviationStats([
      [1, 1, 4],
      [2, 2, 4],
      [3, 3, 5],
      [4, 4, 4],
    ])
    expect(stats!.count).toBe(4)
    expect(stats!.qualityCounts.get(4)).toBe(3)
    expect(stats!.qualityCounts.get(5)).toBe(1)
    expect(stats!.qualityCounts.has(0)).toBe(false)
  })

  it('treats a non-finite quality as invalid (0) instead of dropping the point', () => {
    const stats = computeDeviationStats([
      [1, 1, Number.NaN],
      [2, 2, 4],
    ])
    expect(stats!.count).toBe(2)
    expect(stats!.qualityCounts.get(0)).toBe(1)
    expect(stats!.qualityCounts.get(4)).toBe(1)
  })
})
