import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEY_VALUE_REGEX,
  createRecordRegex,
  parseCsvRecord,
  parseRegexRecord,
  parseTextRecord,
} from '@/core/data/TextRecordParser'

describe('TextRecordParser', () => {
  it('extracts key-value telemetry and prefers embedded enum numbers', () => {
    const result = parseRegexRecord(
      '[ctl] mode=SYS_ERROR speed=LOW(3) dir=FORWARD(1) ult=0.658m angle=0.00 dist=0.40',
    )

    expect(result).toEqual({
      valid: true,
      record: {
        mode: 'SYS_ERROR',
        speed: 3,
        dir: 1,
        ult: 0.658,
        angle: 0,
        dist: 0.4,
      },
    })
  })

  it('supports named fields in a whole-line custom expression', () => {
    const result = parseRegexRecord(
      'x:12.5 y:-3 state:READY',
      String.raw`^x:(?<x>\S+)\s+y:(?<y>\S+)\s+state:(?<state>\S+)$`,
    )

    expect(result.record).toEqual({ x: 12.5, y: -3, state: 'READY' })
  })

  it('supports slash-delimited expressions and positional key-value groups', () => {
    const result = parseRegexRecord('a:1 b:2', String.raw`/(\w+):(\S+)/g`)
    expect(result.record).toEqual({ a: 1, b: 2 })
  })

  it('reports invalid expressions without throwing', () => {
    expect(parseRegexRecord('a=1', '(')).toMatchObject({ valid: false })
    expect(() => createRecordRegex(DEFAULT_KEY_VALUE_REGEX)).not.toThrow()
  })

  it('continues to parse JSON through the same interface', () => {
    expect(parseTextRecord('{"x":1,"state":"OK"}', 'json')).toEqual({
      valid: true,
      record: { x: 1, state: 'OK' },
    })
  })

  it('splits CSV into 1-based column keys and infers types', () => {
    expect(parseCsvRecord('12.5,-3,OK,true')).toEqual({
      valid: true,
      record: { '1': 12.5, '2': -3, '3': 'OK', '4': true },
    })
  })

  it('skips empty CSV fields but keeps column positions', () => {
    expect(parseCsvRecord('a,,c')).toEqual({
      valid: true,
      record: { '1': 'a', '3': 'c' },
    })
  })

  it('returns invalid for blank or all-empty CSV lines', () => {
    expect(parseCsvRecord('   ')).toMatchObject({ valid: false })
    expect(parseCsvRecord(',,')).toMatchObject({ valid: false })
  })

  it('is reachable through parseTextRecord with the csv parser', () => {
    expect(parseTextRecord('12.5,-3,OK,true', 'csv')).toEqual({
      valid: true,
      record: { '1': 12.5, '2': -3, '3': 'OK', '4': true },
    })
  })
})
