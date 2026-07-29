import { describe, expect, it } from 'vitest'
import { splitSeriesByQuality } from '@/core/gnss/QualitySeries'

describe('GNSS quality time-series geometry', () => {
  it('colors every edge by its destination epoch and joins adjacent equal-quality edges', () => {
    const geometry = splitSeriesByQuality(
      [0, 10, 1, 11, 2, 12, 3, 13, 4, 14],
      [0, 5],
      (index) => [1, 1, 4, 4, 5][index],
    )

    expect(geometry.get(1)).toEqual({
      points: [0, 10, 1, 11],
      segments: [0, 2],
    })
    expect(geometry.get(4)).toEqual({
      points: [1, 11, 2, 12, 3, 13],
      segments: [0, 3],
    })
    expect(geometry.get(5)).toEqual({
      points: [3, 13, 4, 14],
      segments: [0, 2],
    })
  })

  it('does not join equal-quality edges across source gaps', () => {
    const geometry = splitSeriesByQuality([0, 10, 1, 11, 4, 14, 5, 15], [0, 2, 2, 2], () => 4)

    expect(geometry.get(4)).toEqual({
      points: [0, 10, 1, 11, 4, 14, 5, 15],
      segments: [0, 2, 2, 2],
    })
  })
})
