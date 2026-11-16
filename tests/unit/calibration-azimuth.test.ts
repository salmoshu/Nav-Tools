import { describe, expect, it } from 'vitest'
import {
  clampAzimuth,
  normalizeAzimuthDelta,
  resizeAzimuthRange,
  shiftAzimuthRange,
} from '../../src/core/camera/CalibrationAzimuth'

describe('calibration azimuth dial geometry', () => {
  it('clamps angles to the full-circle limits and keeps one decimal place', () => {
    expect(clampAzimuth(-181)).toBe(-180)
    expect(clampAzimuth(181)).toBe(180)
    expect(clampAzimuth(12.345)).toBe(12.3)
    expect(clampAzimuth(-12.345)).toBe(-12.3)
  })

  it('normalizes pointer deltas across the ±180° seam', () => {
    expect(normalizeAzimuthDelta(-179 - 179)).toBe(2)
    expect(normalizeAzimuthDelta(179 - -179)).toBe(-2)
    expect(normalizeAzimuthDelta(359)).toBe(-1)
    expect(normalizeAzimuthDelta(180)).toBe(-180)
  })

  it('moves a sector without changing its width', () => {
    expect(shiftAzimuthRange(-20, 40, 25)).toEqual({ min: 5, max: 65 })
    expect(shiftAzimuthRange(5, 65, -25)).toEqual({ min: -20, max: 40 })
  })

  it('stops at either global boundary while preserving the sector width', () => {
    expect(shiftAzimuthRange(160, 170, 30)).toEqual({ min: 170, max: 180 })
    expect(shiftAzimuthRange(-170, -160, -30)).toEqual({ min: -180, max: -170 })
    expect(shiftAzimuthRange(170, 180, -400)).toEqual({ min: -180, max: -170 })
  })

  it('does not rotate a full-circle sector', () => {
    expect(shiftAzimuthRange(-180, 180, 20)).toEqual({ min: -180, max: 180 })
    expect(shiftAzimuthRange(-180, 180, -20)).toEqual({ min: -180, max: 180 })
  })

  it('prevents either handle from crossing the other handle', () => {
    expect(resizeAzimuthRange(-20, 40, 'min', 100)).toEqual({ min: 40, max: 40 })
    expect(resizeAzimuthRange(-20, 40, 'max', -100)).toEqual({ min: -20, max: -20 })
  })

  it('prevents handles from leaving the global boundaries', () => {
    expect(resizeAzimuthRange(-20, 40, 'min', -200)).toEqual({ min: -180, max: 40 })
    expect(resizeAzimuthRange(-20, 40, 'max', 200)).toEqual({ min: -20, max: 180 })
  })
})
