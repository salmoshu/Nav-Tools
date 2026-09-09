import { describe, expect, it } from 'vitest'
import { CameraCalibration } from '../../src/core/camera/CameraCalibration'
import type { CameraCalibrationConfig, InssegFrame } from '../../src/core/camera/CameraCalibrationTypes'

export function config(overrides: Partial<CameraCalibrationConfig> = {}): CameraCalibrationConfig {
  return {
    height: 0.55, fov: 62.292, initialOffset: -21.5,
    minOffset: -25, maxOffset: -18, step: 0.5, minStep: 0.025,
    nearDistance: 1.2, farDistance: 2, nearSide: 'left', biasMinCm: 2, biasMaxCm: 6,
    personClassId: 0, sampleCount: 3, windowMs: 200, maxSpreadM: 0.04,
    settleMs: 500, staleMs: 1000, maxWrites: 12, maxDurationMs: 120000,
    fullCountConfirmed: true, initialParamsConfirmed: true, persistentWritesConfirmed: true,
    ...overrides,
  }
}

export function frame(index: number, near = 1.26, far = 2.03): InssegFrame {
  return {
    timestamp: '240601.120000.123', index, pictureIndex: index,
    targets: [
      { classId: 0, trackId: 10, left: 10, top: 0, right: 100, bottom: 200, distance: near, azimuth: -5 },
      { classId: 0, trackId: 20, left: 200, top: 0, right: 300, bottom: 200, distance: far, azimuth: 5 },
    ],
  }
}

function window(engine: CameraCalibration, firstIndex: number, start: number, near = 1.26, far = 2.03) {
  engine.push(frame(firstIndex, near, far), start)
  engine.push(frame(firstIndex + 1, near, far), start + 100)
  return engine.push(frame(firstIndex + 2, near, far), start + 200)
}

describe('CameraCalibration', () => {
  it('rejects unconfirmed metadata and invalid bounds before starting', () => {
    expect(() => new CameraCalibration(config({ fullCountConfirmed: false }), 0)).toThrow()
    expect(() => new CameraCalibration(config({ minOffset: -20 }), 0)).toThrow()
    expect(() => new CameraCalibration(config({ personClassId: NaN }), 0)).toThrow()
  })

  it('increases absolute offset for far readings and ignores pre-settle samples', () => {
    const engine = new CameraCalibration(config(), 0)
    expect(window(engine, 1, 0, 1.3, 2.1)).toBe(-22)
    engine.push(frame(4), 300)
    expect(engine.snapshot().sampleCount).toBe(0)
    engine.written(-22, 300)
    engine.push(frame(5), 700)
    expect(engine.snapshot().sampleCount).toBe(0)
    window(engine, 6, 800)
    expect(engine.snapshot()).toMatchObject({ offset: -22, writeCount: 1, phase: 'verifying' })
  })

  it('decreases absolute offset for near readings', () => {
    expect(window(new CameraCalibration(config(), 0), 1, 0, 1.1, 1.9)).toBe(-21)
  })

  it('does not round 1.264 down to an accepted 1.26', () => {
    expect(window(new CameraCalibration(config(), 0), 1, 0, 1.264, 2.03)).toBe(-22)
  })

  it('drops verification on a third person and requires two entirely new windows', () => {
    const engine = new CameraCalibration(config(), 0)
    window(engine, 1, 0)
    const extra = frame(4)
    extra.targets.push({ ...extra.targets[0], trackId: 30 })
    engine.push(extra, 300)
    expect(engine.snapshot()).toMatchObject({ phase: 'paused', sampleCount: 0, reportedCount: 3 })
    window(engine, 5, 400)
    expect(engine.snapshot().phase).toBe('verifying')
    window(engine, 8, 700)
    expect(engine.snapshot().phase).toBe('succeeded')
  })

  it('does not keep alive on duplicate packets and stops at the deadline', () => {
    const engine = new CameraCalibration(config({ maxDurationMs: 2000 }), 0)
    engine.push(frame(1), 0)
    engine.push(frame(1), 1000)
    expect(engine.snapshot()).toMatchObject({ phase: 'paused', sampleCount: 0 })
    engine.tick(2000)
    expect(engine.snapshot().phase).toBe('failed')
  })

  it('rejects conflicting errors rather than cancelling them out', () => {
    const engine = new CameraCalibration(config(), 0)
    expect(window(engine, 1, 0, 1.3, 1.9)).toBeUndefined()
    expect(engine.snapshot().phase).toBe('failed')
  })

  it('does not revive after cancellation during a write', () => {
    const engine = new CameraCalibration(config(), 0)
    window(engine, 1, 0, 1.3, 2.1)
    engine.stop()
    engine.written(-22, 300)
    expect(engine.snapshot().phase).toBe('stopped')
  })
  it('accepts 1.26 / 2.03 only after a separate verification window without writing', () => {
    const engine = new CameraCalibration(config(), 0)
    expect(window(engine, 1, 0)).toBeUndefined()
    expect(engine.snapshot().phase).toBe('verifying')
    expect(window(engine, 4, 300)).toBeUndefined()
    expect(engine.snapshot()).toMatchObject({ phase: 'succeeded', writeCount: 0, offset: -21.5 })
  })
})
