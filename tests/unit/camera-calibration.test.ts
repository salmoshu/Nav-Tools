import { describe, expect, it } from 'vitest'
import { CameraCalibration } from '../../src/core/camera/CameraCalibration'
import type { CameraCalibrationConfig, InssegFrame } from '../../src/core/camera/CameraCalibrationTypes'

export function config(overrides: Partial<CameraCalibrationConfig> = {}): CameraCalibrationConfig {
  return {
    height: 0.55, fov: 62.292, initialOffset: -21.5,
    minOffset: -25, maxOffset: -18, step: 0.5, minStep: 0.025,
    targets: [
      { distance: 1.2, biasMinCm: 2, biasMaxCm: 6 },
      { distance: 2, biasMinCm: 2, biasMaxCm: 6 },
    ],
    nearSide: 'left', personClassId: 0, sampleCount: 3, windowMs: 200, maxSpreadM: 0.04,
    settleMs: 500, staleMs: 1000, maxWrites: 12, maxDurationMs: 120000,
    ...overrides,
  }
}

/** distances 按画面从左到右排列 */
export function frame(index: number, distances: number[] = [1.26, 2.03]): InssegFrame {
  return {
    timestamp: '240601.120000.123', index, pictureIndex: index,
    targets: distances.map((distance, side) => ({
      classId: 0, trackId: 10 + side * 10,
      left: 10 + side * 190, top: 0, right: 100 + side * 190, bottom: 200,
      distance, azimuth: side === 0 ? -5 : 5,
    })),
  }
}

function window(
  engine: CameraCalibration, firstIndex: number, start: number,
  distances: number[] = [1.26, 2.03],
) {
  engine.push(frame(firstIndex, distances), start)
  engine.push(frame(firstIndex + 1, distances), start + 100)
  return engine.push(frame(firstIndex + 2, distances), start + 200)
}

describe('CameraCalibration', () => {
  it('rejects invalid bounds and invalid targets before starting', () => {
    expect(() => new CameraCalibration(config({ minOffset: -20 }), 0)).toThrow()
    expect(() => new CameraCalibration(config({ personClassId: NaN }), 0)).toThrow()
    expect(() => new CameraCalibration(config({ targets: [] }), 0)).toThrow()
    expect(() => new CameraCalibration(
      config({ targets: [{ distance: 1.2, biasMinCm: 6, biasMaxCm: 2 }] }), 0),
    ).toThrow()
  })

  it('increases absolute offset for far readings and ignores pre-settle samples', () => {
    const engine = new CameraCalibration(config(), 0)
    expect(window(engine, 1, 0, [1.3, 2.1])).toBe(-22)
    engine.push(frame(4), 300)
    expect(engine.snapshot().sampleCount).toBe(0)
    engine.written(-22, 300)
    engine.push(frame(5), 700)
    expect(engine.snapshot().sampleCount).toBe(0)
    window(engine, 6, 800)
    expect(engine.snapshot()).toMatchObject({ offset: -22, writeCount: 1, phase: 'verifying' })
  })

  it('decreases absolute offset for near readings', () => {
    expect(window(new CameraCalibration(config(), 0), 1, 0, [1.1, 1.9])).toBe(-21)
  })

  it('does not round 1.264 down to an accepted 1.26', () => {
    expect(window(new CameraCalibration(config(), 0), 1, 0, [1.264, 2.03])).toBe(-22)
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
    expect(window(engine, 1, 0, [1.3, 1.9])).toBeUndefined()
    expect(engine.snapshot().phase).toBe('failed')
  })

  it('does not revive after cancellation during a write', () => {
    const engine = new CameraCalibration(config(), 0)
    window(engine, 1, 0, [1.3, 2.1])
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
    const history = engine.snapshot().history
    const [entry] = history
    expect(entry).toMatchObject({
      offset: -21.5, distances: [1.26, 2.03], accepted: true, verification: false,
    })
    expect(entry.errorsCm[0]).toBeCloseTo(6, 6)
    expect(entry.errorsCm[1]).toBeCloseTo(3, 6)
    expect(history.at(-1)).toMatchObject({ accepted: true, verification: true })
  })

  it('supports single-target calibration end to end', () => {
    const single = config({ targets: [{ distance: 1.2, biasMinCm: 2, biasMaxCm: 6 }] })
    const engine = new CameraCalibration(single, 0)
    expect(window(engine, 1, 0, [1.26])).toBeUndefined()
    expect(engine.snapshot().phase).toBe('verifying')
    expect(window(engine, 4, 300, [1.26])).toBeUndefined()
    expect(engine.snapshot()).toMatchObject({ phase: 'succeeded', writeCount: 0, offset: -21.5 })
    expect(engine.snapshot().history[0].distances).toEqual([1.26])
    expect(engine.snapshot().history.map((entry) => entry.verification)).toEqual([false, true])
  })

  it('pauses when the reported target count differs from the config', () => {
    const engine = new CameraCalibration(config(), 0)
    engine.push(frame(1, [1.26]), 0)
    expect(engine.snapshot()).toMatchObject({ phase: 'paused', reportedCount: 1 })
  })

  it('assigns frame targets to config entries by the configured side', () => {
    const rightSide = config({ nearSide: 'right' })
    const engine = new CameraCalibration(rightSide, 0)
    // 画面左=2.03（对人员 2 合格），画面右=1.3（对人员 1 偏远）；人员 1 配置为右侧
    expect(window(engine, 1, 0, [2.03, 1.3])).toBe(-22)
  })
})
