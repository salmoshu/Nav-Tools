import { describe, expect, it } from 'vitest'
import { createDefaultRtkPostSettings } from '../../src/core/gnsslib/RtkPost'
import {
  rinexObservationSpan,
  RtkPostLogDecoder,
  RtkPostProgressTracker,
  formatRtkPostTime,
  intersectObservationSpans,
} from '../../src/core/gnsslib/RtkPostProgress'

const span = { start: Date.UTC(2024, 6, 30), end: Date.UTC(2024, 6, 30, 0, 1) }
const options = createDefaultRtkPostSettings().options
const record = (seconds: number) =>
  `processing : 2024/07/30 00:${seconds === 60 ? '01:00' : `00:${String(seconds).padStart(2, '0')}`} Q=1`

describe('rnx2rtkp log records', () => {
  it('handles CR/LF, split records, trailing records and separate stdout/stderr buffers', () => {
    const decoder = new RtkPostLogDecoder()
    expect(decoder.push('stderr', 'error : no na')).toEqual([])
    expect(decoder.push('stdout', 'stdout line\r\n')).toEqual(['stdout line'])
    expect(decoder.push('stderr', 'v data\rprocessing : x\nlast')).toEqual([
      'error : no nav data',
      'processing : x',
    ])
    expect(decoder.flush()).toEqual(['last'])
    expect(decoder.flush()).toEqual([])
  })
})

describe('RINEX observation time span', () => {
  it('reads RINEX 3 head/tail epochs without mistaking observation rows for times', () => {
    expect(
      rinexObservationSpan(
        'header\nEND OF HEADER\n> 2024 07 30 00 00 00.0000000  0 12\nG01 24100000.000 123456.000',
        '> 2024 07 30 00 01 00.0000000  0 12\nG01 24200000.000 234567.000',
      ),
    ).toEqual(span)
  })

  it('reads RINEX 2 epochs and handles years before 2000', () => {
    const start = ' 99  7 30  0  0  0.0000000  0  6G01G02G03G04G05G06'
    const end = ' 99  7 30  0  1  0.0000000  0  6G01G02G03G04G05G06'
    expect(rinexObservationSpan(`END OF HEADER\n${start}`, end)).toEqual({
      start: Date.UTC(1999, 6, 30),
      end: Date.UTC(1999, 6, 30, 0, 1),
    })
  })

  it('falls back to first/last header times when there are no sampled epochs', () => {
    const header =
      '  2024     7    30     0     0    0.0000000     GPS         TIME OF FIRST OBS\n  2024     7    30     0     1    0.0000000     GPS         TIME OF LAST OBS\nEND OF HEADER\n'
    expect(rinexObservationSpan(header, '')).toEqual(span)
  })

  it('leaves unknown, invalid or zero-length spans indeterminate', () => {
    expect(rinexObservationSpan('compressed or invalid input', '')).toBeUndefined()
    expect(
      rinexObservationSpan('> 2024 02 31 00 00 00.0  0 12', '> 2024 03 01 00 01 00.0  0 12'),
    ).toBeUndefined()
    expect(
      rinexObservationSpan('> 2024 07 30 00 00 00.0  0 12', '> 2024 07 30 00 00 00.0  0 12'),
    ).toBeUndefined()
  })

  it('converts GLONASS UTC observations to the GPST expected by rnx2rtkp', () => {
    const first = '  2023    05    15    09    49   17.0000000     GLO         TIME OF FIRST OBS\n'
    const start = '> 2023 05 15 09 49 17.0000000  0 12\n'
    const end = '> 2023 05 15 10 00 47.0000000  0 12\n'
    expect(rinexObservationSpan(`${first}END OF HEADER\n${start}`, end)).toEqual({
      start: Date.UTC(2023, 4, 15, 9, 49, 35),
      end: Date.UTC(2023, 4, 15, 10, 1, 5),
    })
  })

  it('intersects observation spans and formats GPST without a local-time conversion', () => {
    expect(
      intersectObservationSpans(span, { start: span.start + 10_000, end: span.end - 5000 }),
    ).toEqual({
      start: span.start + 10_000,
      end: span.end - 5000,
    })
    expect(
      intersectObservationSpans(span, { start: span.end, end: span.end + 10_000 }),
    ).toBeUndefined()
    expect(intersectObservationSpans(span)).toEqual(span)
    expect(formatRtkPostTime(span.start + 1234)).toBe('2024-07-30T00:00:01.234')
  })
})

describe('measured post-processing progress', () => {
  it('advances by observation time and reserves 100 for verified success', () => {
    const tracker = new RtkPostProgressTracker(span, options)
    expect(tracker.update(record(0))?.percentage).toBe(0)
    expect(tracker.update(record(30))?.percentage).toBe(50)
    expect(tracker.update(record(15))?.percentage).toBe(50)
    expect(tracker.update(record(60))?.percentage).toBe(99)
  })

  it('reverses time for backward processing', () => {
    const tracker = new RtkPostProgressTracker(span, { ...options, solutionType: 1 })
    expect(tracker.update(record(60))?.percentage).toBe(0)
    expect(tracker.update(record(45))?.percentage).toBe(25)
    expect(tracker.update(record(0))?.percentage).toBe(99)
  })

  it('covers both passes for combined processing, including a repeated boundary epoch', () => {
    const tracker = new RtkPostProgressTracker(span, { ...options, solutionType: 2 })
    expect(tracker.update(record(0))?.percentage).toBe(0)
    expect(tracker.update(record(30))?.percentage).toBe(25)
    expect(tracker.update(record(60))?.percentage).toBe(50)
    expect(tracker.update(record(60))?.percentage).toBe(50)
    expect(tracker.update(record(30))?.percentage).toBe(75)
    expect(tracker.update(record(0))?.percentage).toBe(99)
  })

  it('uses forward progress for Single even when combined is selected', () => {
    const tracker = new RtkPostProgressTracker(span, { ...options, mode: 0, solutionType: 2 })
    expect(tracker.update(record(30))?.percentage).toBe(50)
  })

  it('clamps the span to the selected GPST start/end times, including minute-only inputs', () => {
    const tracker = new RtkPostProgressTracker(
      { start: span.start - 60_000, end: span.end + 60_000 },
      { ...options, startTime: '2024-07-30T00:00', endTime: '2024-07-30T00:01' },
    )
    expect(tracker.update(record(30))?.percentage).toBe(50)
  })

  it('tracks progress from selected bounds without requiring a second observation read', () => {
    const tracker = new RtkPostProgressTracker(undefined, {
      ...options,
      startTime: '2024-07-30T00:00:00',
      endTime: '2024-07-30T00:01:00',
    })
    expect(tracker.update(record(30))?.percentage).toBe(50)
  })

  it('reports the engine timestamp without inventing a percentage when duration is unknown', () => {
    const tracker = new RtkPostProgressTracker(undefined, options)
    expect(tracker.update('error : no nav data')).toBeNull()
    expect(tracker.update(record(30))).toEqual({
      phase: 'processing',
      percentage: null,
      processingTime: '2024/07/30 00:00:30',
      processingMessage: record(30),
    })
  })
})
