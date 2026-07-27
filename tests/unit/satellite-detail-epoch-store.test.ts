import { describe, expect, it } from 'vitest'
import {
  SatelliteDetailEpochStore,
  type SatelliteDetailSample,
} from '@/core/gnss/SatelliteDetailEpochStore'

function satellite(prn: string, snr: number): SatelliteDetailSample {
  return {
    prn,
    elevation: 40,
    azimuth: 80,
    snr,
    constellation: 'GPS',
    timestamp: '2026-07-27T00:00:00.000Z',
  }
}

describe('SatelliteDetailEpochStore', () => {
  it('maps elapsed time to deduplicated satellite snapshots', () => {
    const store = new SatelliteDetailEpochStore()
    store.append('12:00:00.000', [satellite('1', 40)])
    store.append('12:00:00.100')
    store.append('12:00:00.200', [satellite('1', 40)])
    store.append('12:00:00.300', [satellite('2', 45)])

    expect(store.length).toBe(4)
    expect(store.duration).toBe(300)
    expect(store.snapshotCount).toBe(2)
    expect(store.findNearestElapsedTime(110)).toBe(1)
    expect(store.getSnapshot(1).map((item) => item.prn)).toEqual(['1'])
    expect(store.getSnapshot(3).map((item) => item.prn)).toEqual(['2'])

    const detached = store.getSnapshot(0)
    detached[0].snr = 1
    expect(store.getSnapshot(0)[0].snr).toBe(40)
  })

  it('supports empty leading epochs and resets all pooled data', () => {
    const store = new SatelliteDetailEpochStore()
    store.append('12:00:00.000')
    expect(store.getSnapshot(0)).toEqual([])

    store.clear()
    expect(store.length).toBe(0)
    expect(store.snapshotCount).toBe(0)
  })

  it('retains a 12 hour 10 Hz index while pooling lower-rate detail changes', () => {
    const store = new SatelliteDetailEpochStore()
    const details = Array.from({ length: 32 }, (_, index) => satellite(String(index + 1), 30))
    const epochCount = 12 * 60 * 60 * 10

    for (let index = 0; index < epochCount; index += 1) {
      const milliseconds = index * 100
      const hours = Math.floor(milliseconds / 3_600_000)
      const minutes = Math.floor(milliseconds / 60_000) % 60
      const seconds = Math.floor(milliseconds / 1_000) % 60
      const tenths = Math.floor(milliseconds / 100) % 10
      const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
      if (index % 10 === 0) {
        details[0].snr = 30 + ((index / 10) % 20)
        store.append(time, details)
      } else {
        store.append(time)
      }
    }

    expect(store.length).toBe(432_000)
    expect(store.snapshotCount).toBe(43_200)
    expect(store.findNearestElapsedTime(43_199_900)).toBe(431_999)
    expect(store.getSnapshot(431_999)).toHaveLength(32)
  }, 20_000)
})
