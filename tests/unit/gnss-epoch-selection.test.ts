import { describe, expect, it } from 'vitest'
import { NumericEpochStore } from '@/core/gnss/NumericEpochStore'
import { findPositionEpoch } from '@/core/gnss/EpochSelection'

describe('trajectory epoch selection', () => {
  it('resolves simplified points from full history and uses the closest time for repeated coordinates', () => {
    const history = new NumericEpochStore(['E', 'N'])
    for (let index = 0; index < 8; index++) {
      history.append(`12000${index}.000`, { E: index % 4, N: index % 4 })
    }
    expect(findPositionEpoch(history, ['E', 'N'], 2, 2, 0)).toBe(2)
    expect(findPositionEpoch(history, ['E', 'N'], 2, 2, 7000)).toBe(6)
    expect(findPositionEpoch(history, ['E', 'N'], 2, 2, 7000, 3)).toBe(2)
    expect(findPositionEpoch(new NumericEpochStore(['E', 'N']), ['E', 'N'], 0, 0, 0)).toBe(-1)
  })
})
