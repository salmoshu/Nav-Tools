import { describe, expect, it } from 'vitest'
import type { SatelliteEpochSample } from '@/core/gnss/SatelliteEpochAssembler'
import { SatelliteEpochStore } from '@/core/gnss/SatelliteEpochStore'

function sample(
  time: string,
  total: number,
  complete = true,
  overrides: Partial<SatelliteEpochSample['counts']> = {},
): SatelliteEpochSample {
  return {
    key: time,
    time,
    counts: {
      GPS: total,
      GLONASS: 0,
      BEIDOU: 0,
      GALILEO: 0,
      QZSS: 0,
      OTHER: 0,
      ...overrides,
    },
    total,
    complete,
  }
}

describe('SatelliteEpochStore', () => {
  it('unwraps midnight into monotonic time and finds the closest epoch', () => {
    const store = new SatelliteEpochStore({ chunkSize: 2 })
    store.append(sample('23:59:59.900', 10))
    store.append(sample('00:00:00.000', 11))
    store.append(sample('00:00:00.100', 12))

    expect(store.length).toBe(3)
    expect(store.chunkCount).toBe(2)
    expect(store.getSample(1).key).toBe('00:00:00.000')
    expect(store.formatTime(0)).toBe('23:59:59.900')
    expect(store.formatTime(1)).toBe('00:00:00.000')
    expect(store.findNearestIndex('00:00:00.060')).toBe(2)
    expect(store.findNearestIndex(86_400_020)).toBe(1)
    expect(store.duration).toBe(200)
    expect(store.getElapsedTime(2)).toBe(200)
    expect(store.findNearestElapsedTime(140)).toBe(1)
    expect(store.findNearestElapsedTime(160)).toBe(2)
  })

  it('returns incomplete and missing epochs as separate line-strip segments', () => {
    const store = new SatelliteEpochStore()
    store.append(sample('10:00:00.0', 5))
    store.append(sample('10:00:00.1', 0, false))
    store.append(sample('10:00:00.2', 7))
    store.append(sample('10:00:00.5', 8))

    const range = store.extractSeries('TOTAL', 0, 4, 20)
    expect(Array.from(range.points)).toEqual([0, 5, 2, 7, 3, 8])
    expect(Array.from(range.segments)).toEqual([0, 1, 1, 1, 2, 1])
    expect(range.lod).toBe(false)
    expect(store.getRangeMax('TOTAL', 0, 4)).toBe(8)
  })

  it('keeps a small out-of-order receiver epoch and starts a new segment', () => {
    const store = new SatelliteEpochStore()
    store.append(sample('09:15:07.500', 10))
    store.append(sample('09:15:07.400', 11))
    store.append(sample('09:15:07.600', 12))

    expect(store.length).toBe(3)
    expect(store.getSample(1).time).toBe('09:15:07.400')
    const range = store.extractSeries('TOTAL', 0, 2, 20)
    expect(Array.from(range.points)).toEqual([0, 10, 1, 11, 2, 12])
    expect(Array.from(range.segments)).toEqual([0, 1, 1, 2])
  })

  it('does not reconnect an LOD line across an incomplete epoch', () => {
    const store = new SatelliteEpochStore()
    for (let index = 0; index < 20; index += 1) {
      store.append(sample(`10:00:${String(index).padStart(2, '0')}.0`, index, index !== 10))
    }

    const range = store.extractSeries('TOTAL', 0, 19, 6)
    expect(range.lod).toBe(true)
    expect(range.segments.length).toBeGreaterThan(2)
  })

  it('preserves minima and maxima while respecting maxPoints', () => {
    const store = new SatelliteEpochStore()
    ;[5, 100, 6, 4, 7, 3, 80, 8].forEach((total, index) => {
      store.append(sample(`12:00:00.${index}`, total))
    })

    const range = store.extractSeries('TOTAL', 0, store.length, 4)
    const values = Array.from(range.points).filter((_, index) => index % 2 === 1)
    expect(range.lod).toBe(true)
    expect(range.points.length / 2).toBeLessThanOrEqual(4)
    expect(values).toContain(100)
    expect(values).toContain(3)
    expect(Array.from(range.segments)).toEqual([0, 4])
  })

  it('never exceeds tiny LOD point budgets and handles all-incomplete ranges', () => {
    const store = new SatelliteEpochStore()
    ;[5, 100, 2, 80, 6].forEach((total, index) => {
      store.append(sample(`12:00:00.${index}`, total))
    })

    expect(store.extractSeries('TOTAL', 0, 4, 3).points.length / 2).toBeLessThanOrEqual(3)

    const incomplete = new SatelliteEpochStore()
    incomplete.append(sample('12:00:00.0', 1, false))
    const range = incomplete.extractSeries('TOTAL', 0, 0, 10)
    expect(range.points).toEqual([])
    expect(range.segments).toEqual([])
  })

  it('retains 12 hours at 10 Hz across typed-array chunk boundaries', () => {
    const store = new SatelliteEpochStore({ chunkSize: 4_096 })
    const epochCount = 12 * 60 * 60 * 10
    for (let index = 0; index < epochCount; index += 1) {
      const timestamp = index * 100
      const hours = Math.floor(timestamp / 3_600_000)
      const minutes = Math.floor(timestamp / 60_000) % 60
      const seconds = Math.floor(timestamp / 1_000) % 60
      const tenths = Math.floor(timestamp / 100) % 10
      const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
      store.append(sample(time, index % 64))
    }

    expect(store.length).toBe(432_000)
    expect(store.chunkCount).toBe(Math.ceil(432_000 / 4_096))
    expect(store.getSample(431_999).total).toBe(431_999 % 64)
    expect(store.findNearestIndex(43_199_900)).toBe(431_999)
    const overview = store.extractSeries('TOTAL', 0, store.length, 2_000)
    expect(overview.lod).toBe(true)
    expect(overview.points.length / 2).toBeLessThanOrEqual(2_000)
    expect(store.getRangeMax('TOTAL', 0, store.length)).toBe(63)

    store.clear()
    expect(store.length).toBe(0)
    expect(store.findNearestIndex(0)).toBe(-1)
  }, 20_000)
})
