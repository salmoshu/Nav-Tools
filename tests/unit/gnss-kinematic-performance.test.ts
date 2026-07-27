import { beforeAll, describe, expect, it } from 'vitest'
import { NumericEpochStore } from '@/core/gnss/NumericEpochStore'

const EPOCH_COUNT = 432_000
const OVERVIEW_POINTS = 2_400

const position = new NumericEpochStore(['E', 'N', 'U'])
const speed = new NumericEpochStore(['SPEED'])
let appendDuration = 0

function clockAt(index: number): string {
  const totalMs = index * 100
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor(totalMs / 60_000) % 60
  const seconds = Math.floor(totalMs / 1_000) % 60
  const tenth = Math.floor(totalMs / 100) % 10
  return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}${String(seconds).padStart(2, '0')}.${tenth}`
}

describe('GNSS kinematic performance (12 h at 10 Hz)', () => {
  beforeAll(() => {
    const startedAt = performance.now()
    for (let index = 0; index < EPOCH_COUNT; index += 1) {
      const time = clockAt(index)
      position.append(time, {
        E: index % 101,
        N: -(index % 37),
        U: (index % 53) - 26,
      })
      speed.append(time, { SPEED: 5 + (index % 25) * 0.4 })
    }
    appendDuration = performance.now() - startedAt
  }, 60_000)

  it('stores every position and speed epoch in bounded chunk capacity', () => {
    expect(position.length).toBe(EPOCH_COUNT)
    expect(speed.length).toBe(EPOCH_COUNT)
    expect(position.capacity).toBeGreaterThanOrEqual(EPOCH_COUNT)
    expect(speed.capacity).toBeGreaterThanOrEqual(EPOCH_COUNT)
    expect(position.capacity).toBeLessThan(EPOCH_COUNT * 1.02)
    expect(speed.capacity).toBeLessThan(EPOCH_COUNT * 1.02)
    expect(appendDuration).toBeLessThan(30_000)
  })

  it('extracts four bounded, extrema-preserving WebGL overview series', () => {
    const fields: ReadonlyArray<{
      store: NumericEpochStore
      field: string
      expectedMin: number
      expectedMax: number
    }> = [
      { store: position, field: 'E', expectedMin: 0, expectedMax: 100 },
      { store: position, field: 'N', expectedMin: -36, expectedMax: 0 },
      { store: position, field: 'U', expectedMin: -26, expectedMax: 26 },
      { store: speed, field: 'SPEED', expectedMin: 5, expectedMax: 14.6 },
    ]

    const startedAt = performance.now()
    for (const { store, field, expectedMin, expectedMax } of fields) {
      const series = store.extractSeries(field, 0, EPOCH_COUNT - 1, OVERVIEW_POINTS)
      const pointArray = new Float32Array(series.points)
      const segmentArray = new Uint32Array(series.segments)
      const values = series.points.filter((_, index) => index % 2 === 1)

      expect(series.lod).toBe(true)
      expect(series.points.length / 2).toBeLessThanOrEqual(OVERVIEW_POINTS)
      expect(Math.min(...values)).toBeCloseTo(expectedMin, 4)
      expect(Math.max(...values)).toBeCloseTo(expectedMax, 4)
      expect(pointArray.length).toBe(series.points.length)
      expect(segmentArray.length).toBe(series.segments.length)
      expect(segmentArray.length % 2).toBe(0)
    }
    expect(performance.now() - startedAt).toBeLessThan(20_000)
  })
})
