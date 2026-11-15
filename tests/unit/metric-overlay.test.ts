// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  findNearestMetricOverlaySample,
  findNearestTimeIndex,
  fractionalEpochIndex,
  projectMetricOverlay,
} from '../../src/core/gnss/MetricOverlay'

describe('metric overlay projection', () => {
  it('places samples at fractional primary epochs using their timestamps', () => {
    const result = projectMetricOverlay(
      [1000, 2000, 3000],
      [
        { timeMs: 1500, value: 10, quality: 4 },
        { timeMs: 2500, value: 20, quality: 4 },
      ],
      0,
      0,
      3,
    )
    expect(result.byQuality.get(4)).toEqual({
      points: [0.5, 10, 1.5, 20],
      segments: [0, 2],
    })
    expect(result.range).toEqual({ min: 10, max: 20 })
  })

  it('separates quality colors and breaks lines at missing values', () => {
    const result = projectMetricOverlay(
      [1000, 2000, 3000, 4000],
      [
        { timeMs: 1500, value: 1, quality: 4 },
        { timeMs: 2500, value: 3, quality: 5 },
        { timeMs: 3500, value: null, quality: 4 },
        { timeMs: 3600, value: 5, quality: 4 },
      ],
      0,
      0,
      4,
    )
    expect(result.byQuality.get(4)).toEqual({
      points: [0.5, 1, 2.6, 5],
      segments: [0, 1, 1, 1],
    })
    expect(result.byQuality.get(5)).toEqual({
      points: [0.5, 1, 1.5, 3],
      segments: [0, 2],
    })
    expect(result.range).toEqual({ min: 1, max: 5 })
  })

  it('connects every chronological neighbour when fix qualities alternate', () => {
    const result = projectMetricOverlay(
      [0, 1000, 2000, 3000],
      [
        { timeMs: 0, value: 0, quality: 4 },
        { timeMs: 1000, value: 1, quality: 5 },
        { timeMs: 2000, value: 2, quality: 2 },
        { timeMs: 3000, value: 3, quality: 4 },
      ],
      0,
      0,
      4,
    )

    expect(result.byQuality.get(5)).toEqual({ points: [0, 0, 1, 1], segments: [0, 2] })
    expect(result.byQuality.get(2)).toEqual({ points: [1, 1, 2, 2], segments: [0, 2] })
    expect(result.byQuality.get(4)).toEqual({
      points: [0, 0, 2, 2, 3, 3],
      segments: [0, 1, 1, 2],
    })
  })

  it('applies the source clock offset and only includes visible values in Y fitting', () => {
    const result = projectMetricOverlay(
      [1000, 2000, 3000, 4000],
      [
        { timeMs: -500, value: -20, quality: 4 },
        { timeMs: 500, value: 10, quality: 4 },
        { timeMs: 1000, value: 20, quality: 4 },
        { timeMs: 2500, value: 30, quality: 4 },
      ],
      1000,
      1.1,
      1.9,
    )
    expect(result.range).toEqual({ min: 20, max: 20 })
    expect(
      projectMetricOverlay([], [{ timeMs: 0, value: 1, quality: 4 }], 0, 0, 1).range,
    ).toBeNull()
  })

  it('finds the same nearest epoch by timestamps instead of array position', () => {
    expect(findNearestTimeIndex([1000, 2000, 3000], 1800)).toBe(1)
    expect(findNearestTimeIndex([1000, 2000, 3000], 2600)).toBe(2)
    expect(findNearestTimeIndex([], 1000)).toBe(-1)
    const samples = [
      { timeMs: 1100, value: 1, quality: 4 },
      { timeMs: 2100, value: 2, quality: 5 },
      { timeMs: 3100, value: 3, quality: 2 },
    ]
    expect(findNearestMetricOverlaySample(samples, 2050)).toEqual({
      sample: samples[1],
      index: 1,
    })
    expect(fractionalEpochIndex([1000, 2000, 3000], 2500)).toBe(1.5)
  })
})
