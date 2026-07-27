import { describe, expect, it } from 'vitest'
import { NumericEpochStore } from '@/core/gnss/NumericEpochStore'

describe('NumericEpochStore', () => {
  it('stores nullable multi-field samples in typed-array chunks', () => {
    const store = new NumericEpochStore(['E', 'N', 'U'], { chunkSize: 2 })

    expect(store.append('120000.00', { E: 1, N: 2, U: null })).toBe(0)
    expect(store.append('12:00:00.100', [3, 4, 5])).toBe(1)
    expect(store.append('2026-07-26T12:00:00.200Z', { E: 6, N: 7, U: 8 })).toBe(2)

    expect(store.length).toBe(3)
    expect(store.capacity).toBe(4)
    expect(store.chunkCount).toBe(2)
    expect(store.getValue('E', 0)).toBe(1)
    expect(store.getValue('U', 0)).toBeNull()
    expect(store.getValue('U', 2)).toBe(8)
    expect(store.formatTime(0)).toBe('12:00:00.000')
    expect(store.formatTime(1)).toBe('12:00:00.100')
    expect(store.formatTime(2)).toBe('12:00:00.200')
  })

  it('can replace the last sample at the same timestamp for VTG/RMC merging', () => {
    const store = new NumericEpochStore(['SPEED'])
    store.append('08:00:00.0', { SPEED: 10 })
    const index = store.append('080000.00', { SPEED: 12.5 }, { replaceLast: true })

    expect(index).toBe(0)
    expect(store.length).toBe(1)
    expect(store.getValue('SPEED', 0)).toBeCloseTo(12.5)

    store.append('08:00:00.0', { SPEED: 13 })
    expect(store.length).toBe(2)
  })

  it('optionally preserves double-precision coordinates', () => {
    const longitude = 121.405263123
    const store = new NumericEpochStore(['LONGITUDE'], { valuePrecision: 'float64' })
    store.append('12:00:00.0', { LONGITUDE: longitude })

    expect(store.getValue('LONGITUDE', 0)).toBe(longitude)
  })

  it('unwraps midnight without a break and breaks a lightly reversed timestamp', () => {
    const store = new NumericEpochStore(['E'])
    store.append('23:59:59.900', { E: 1 })
    store.append('00:00:00.000', { E: 2 })
    store.append('00:00:00.100', { E: 3 })
    store.append('00:00:00.050', { E: 4 })
    store.append('00:00:00.200', { E: 5 })

    const series = store.extractSeries('E', 0, store.length - 1, 20)
    expect(series.points).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5])
    expect(series.segments).toEqual([0, 3, 3, 2])
    expect(store.formatTime(1)).toBe('00:00:00.000')
    expect(store.duration).toBe(300)
    expect(store.getElapsedTime(2)).toBe(200)
    expect(store.findNearestElapsedTime(140)).toBe(1)
    expect(store.findNearestElapsedTime(180)).toBe(2)
  })

  it('treats null values and real time gaps as line breaks', () => {
    const store = new NumericEpochStore(['E'])
    store.append('10:00:00.0', { E: 1 })
    store.append('10:00:00.1', { E: null })
    store.append('10:00:00.2', { E: 3 })
    store.append('10:00:00.5', { E: 4 })

    const series = store.extractSeries('E', 0, 3, 20)
    expect(series.points).toEqual([0, 1, 2, 3, 3, 4])
    expect(series.segments).toEqual([0, 1, 1, 1, 2, 1])
    expect(store.getRange('E', 0, 3)).toEqual({ min: 1, max: 4 })
  })

  it('uses bounded min/max LOD without flattening extrema', () => {
    const store = new NumericEpochStore(['E'])
    ;[5, 100, 6, 4, 7, -20, 80, 8].forEach((value, index) => {
      store.append(`12:00:00.${index}`, { E: value })
    })

    const series = store.extractSeries('E', 0, store.length - 1, 4)
    const values = series.points.filter((_, index) => index % 2 === 1)
    expect(series.lod).toBe(true)
    expect(series.points.length / 2).toBeLessThanOrEqual(4)
    expect(values).toContain(100)
    expect(values).toContain(-20)
    expect(store.getRange('E', 0, store.length - 1)).toEqual({ min: -20, max: 100 })
  })

  it('retains 12 hours at 10 Hz with bounded overview extraction', () => {
    const store = new NumericEpochStore(['E', 'N', 'U'], { chunkSize: 4096 })
    const epochCount = 12 * 60 * 60 * 10

    for (let index = 0; index < epochCount; index += 1) {
      const totalMs = index * 100
      const hh = Math.floor(totalMs / 3_600_000)
      const mm = Math.floor(totalMs / 60_000) % 60
      const ss = Math.floor(totalMs / 1_000) % 60
      const tenth = Math.floor(totalMs / 100) % 10
      store.append(
        `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}${String(ss).padStart(2, '0')}.${tenth}`,
        { E: index % 101, N: -(index % 37), U: index % 53 },
      )
    }

    expect(store.length).toBe(432_000)
    expect(store.capacity).toBe(Math.ceil(epochCount / 4096) * 4096)
    expect(store.getValue('N', epochCount - 1)).toBe(-(431_999 % 37))

    const overview = store.extractSeries('E', 0, store.length - 1, 2000)
    expect(overview.lod).toBe(true)
    expect(overview.points.length / 2).toBeLessThanOrEqual(2000)
    expect(store.getRange('E', 0, store.length - 1)).toEqual({ min: 0, max: 100 })

    store.clear()
    expect(store.length).toBe(0)
    expect(store.capacity).toBe(0)
    expect(store.getRange('E', 0, 1)).toBeNull()
  }, 20_000)

  it('rejects unknown fields, invalid times and out-of-range reads', () => {
    expect(() => new NumericEpochStore([])).toThrow()
    const store = new NumericEpochStore(['E'])
    expect(() => store.append('not-a-time', { E: 1 })).toThrow()
    store.append('00:00:00.0', { E: 1 })
    expect(() => store.getValue('N', 0)).toThrow()
    expect(() => store.getValue('E', 1)).toThrow()
  })
})
