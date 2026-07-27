import { describe, expect, it } from 'vitest'
import {
  createInitialSatelliteCountViewport,
  fitSatelliteCountViewport,
  panSatelliteCountViewport,
  SATELLITE_COUNT_LIVE_WINDOW_EPOCHS,
  SATELLITE_COUNT_MIN_VISIBLE_EPOCHS,
  updateSatelliteCountViewportOnData,
  zoomSatelliteCountViewport,
} from '@/core/gnss/SatelliteCountViewport'

describe('SatelliteCountViewport', () => {
  it('returns a neutral range for empty or invalid data lengths', () => {
    expect(createInitialSatelliteCountViewport(0)).toEqual({ start: 0, end: 0 })
    expect(fitSatelliteCountViewport(-1)).toEqual({ start: 0, end: 0 })
    expect(fitSatelliteCountViewport(Number.NaN)).toEqual({ start: 0, end: 0 })
    expect(panSatelliteCountViewport({ start: 10, end: 20 }, 5, 0)).toEqual({
      start: 0,
      end: 0,
    })
  })

  it('uses the latest 40 epochs as the initial live range', () => {
    expect(SATELLITE_COUNT_LIVE_WINDOW_EPOCHS).toBe(40)
    expect(createInitialSatelliteCountViewport(10)).toEqual({ start: 0, end: 10 })
    expect(createInitialSatelliteCountViewport(40)).toEqual({ start: 0, end: 40 })
    expect(createInitialSatelliteCountViewport(41)).toEqual({ start: 1, end: 41 })
  })

  it('handles a full 12-hour 10 Hz data set without truncating indices', () => {
    const length = 12 * 60 * 60 * 10

    expect(length).toBe(432_000)
    expect(createInitialSatelliteCountViewport(length)).toEqual({
      start: 431_960,
      end: 432_000,
    })
    expect(fitSatelliteCountViewport(length)).toEqual({
      start: 0,
      end: 432_000,
    })
  })

  it('zooms around the mouse anchor while preserving its relative position', () => {
    const before = { start: 0, end: 1_000 }
    const anchor = 250
    const after = zoomSatelliteCountViewport(before, anchor, 0.5, 1_000)

    expect(after).toEqual({ start: 125, end: 625 })
    expect((anchor - after.start) / (after.end - after.start)).toBeCloseTo(0.25)
  })

  it('limits zoom to the whole range and the minimum visible epoch count', () => {
    expect(SATELLITE_COUNT_MIN_VISIBLE_EPOCHS).toBe(2)

    const zoomedIn = zoomSatelliteCountViewport({ start: 0, end: 100 }, 50, 0.000_001, 100)
    expect(zoomedIn.end - zoomedIn.start).toBeCloseTo(2)

    const zoomedOut = zoomSatelliteCountViewport({ start: 25, end: 75 }, 50, 10, 100)
    expect(zoomedOut).toEqual({ start: 0, end: 100 })
  })

  it('pans while preserving span and stopping at both data boundaries', () => {
    expect(panSatelliteCountViewport({ start: 100, end: 200 }, -500, 1_000)).toEqual({
      start: 0,
      end: 100,
    })
    expect(panSatelliteCountViewport({ start: 100, end: 200 }, 5_000, 1_000)).toEqual({
      start: 900,
      end: 1_000,
    })
  })

  it('follows the newest epoch when live data is appended', () => {
    expect(
      updateSatelliteCountViewportOnData({ start: 100, end: 200 }, 1_000, 1_001, 'live'),
    ).toEqual({ start: 961, end: 1_001 })
  })

  it('fits overview mode once, then preserves the user viewport', () => {
    expect(updateSatelliteCountViewportOnData(undefined, 0, 1_000, 'overview')).toEqual({
      start: 0,
      end: 1_000,
    })

    expect(
      updateSatelliteCountViewportOnData({ start: 100, end: 200 }, 1_000, 1_001, 'overview'),
    ).toEqual({ start: 100, end: 200 })

    // Even a previously fitted range stays stable; appends do not override a
    // subsequent pan/zoom decision made by the user.
    expect(
      updateSatelliteCountViewportOnData({ start: 0, end: 1_000 }, 1_000, 1_001, 'overview'),
    ).toEqual({ start: 0, end: 1_000 })
  })

  it('clamps a preserved overview when the data set shrinks', () => {
    expect(
      updateSatelliteCountViewportOnData({ start: 900, end: 1_000 }, 1_000, 500, 'overview'),
    ).toEqual({ start: 400, end: 500 })
  })
})
