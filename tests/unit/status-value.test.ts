import { describe, expect, it } from 'vitest'
import { filterDisplayableStatusEntries, hasStatusData } from '@/core/status/statusValue'

describe('status values', () => {
  it('removes boolean entries while retaining empty non-boolean entries', () => {
    expect(
      filterDisplayableStatusEntries([
        ['enabled', true],
        ['disabled', false],
        ['count', 0],
        ['empty', ''],
        ['missing', null],
      ]),
    ).toEqual([
      ['count', 0],
      ['empty', ''],
      ['missing', null],
    ])
  })

  it.each([
    ['text', true],
    [0, true],
    [12.5, true],
    [{ value: 1 }, true],
    ['', false],
    [null, false],
    [undefined, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])('reports whether %j contains data', (value, expected) => {
    expect(hasStatusData(value)).toBe(expected)
  })
})
