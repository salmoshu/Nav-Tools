import { describe, expect, it } from 'vitest'

import {
  TextEpochStore,
  buildTextTimeline,
  formatElapsedTime,
} from '@/core/file/TextEpochStore'

describe('TextEpochStore', () => {
  it('clamps appended times to non-negative and non-decreasing', () => {
    const store = new TextEpochStore()
    store.append(-5)
    store.append(100)
    store.append(50)
    store.append(Number.NaN)

    expect(store.length).toBe(4)
    expect(store.getElapsedTime(0)).toBe(0)
    expect(store.getElapsedTime(1)).toBe(100)
    expect(store.getElapsedTime(2)).toBe(100)
    expect(store.getElapsedTime(3)).toBe(100)
    expect(store.duration).toBe(100)
  })

  it('formats virtual elapsed time without wrapping at 24h', () => {
    expect(formatElapsedTime(0)).toBe('00:00:00.000')
    expect(formatElapsedTime(83_456)).toBe('00:01:23.456')
    const store = new TextEpochStore()
    store.append(0)
    store.append((26 * 3600 + 2 * 60 + 3.25) * 1000)
    expect(store.formatTime(1)).toBe('26:02:03.250')
    expect(store.duration).toBe((26 * 3600 + 2 * 60 + 3.25) * 1000)
  })

  it('finds the nearest epoch to a clamped target time', () => {
    const store = new TextEpochStore()
    for (const time of [0, 100, 200, 400]) store.append(time)

    expect(store.findNearestElapsedTime(-10)).toBe(0)
    expect(store.findNearestElapsedTime(40)).toBe(0)
    expect(store.findNearestElapsedTime(60)).toBe(1)
    expect(store.findNearestElapsedTime(290)).toBe(2)
    expect(store.findNearestElapsedTime(310)).toBe(3)
    expect(store.findNearestElapsedTime(9999)).toBe(3)
    expect(new TextEpochStore().findNearestElapsedTime(0)).toBe(-1)
  })

  it('rejects out-of-range index access', () => {
    const store = new TextEpochStore()
    store.append(0)
    expect(() => store.getElapsedTime(1)).toThrow(RangeError)
    expect(() => store.formatTime(-1)).toThrow(RangeError)
  })
})

describe('buildTextTimeline', () => {
  it('assigns the sample clock to lines without time fields', () => {
    const { store, records } = buildTextTimeline('noise line\n{"a":1}\n\n{"a":2}\n', {
      parser: 'json',
      sampleIntervalMs: 20,
      isCsv: false,
    })

    expect(store.length).toBe(3)
    expect(store.getElapsedTime(0)).toBe(0)
    expect(store.getElapsedTime(1)).toBe(20)
    expect(store.getElapsedTime(2)).toBe(40)
    expect(records.map((entry) => entry.epochIndex)).toEqual([1, 2])
    expect(records[0].record).toEqual({ a: 1 })
  })

  it('normalizes numeric time fields to a zero-based axis', () => {
    const content = ['{"time": 10.5, "v": 1}', '{"time": 11.0, "v": 2}', '{"time": 10.9, "v": 3}'].join(
      '\n',
    )
    const { store, records } = buildTextTimeline(content, {
      parser: 'json',
      sampleIntervalMs: 20,
      isCsv: false,
    })

    expect(records).toHaveLength(3)
    expect(store.getElapsedTime(0)).toBe(0)
    expect(store.getElapsedTime(1)).toBe(500)
    // 时间回退被钳制为非递减
    expect(store.getElapsedTime(2)).toBe(500)
  })

  it('anchors the first timed record at zero and resumes the sample clock after it', () => {
    const content = ['{"v": 1}', '{"time": 5.0, "v": 2}', '{"v": 3}'].join('\n')
    const { store } = buildTextTimeline(content, {
      parser: 'json',
      sampleIntervalMs: 20,
      isCsv: false,
    })

    expect(store.getElapsedTime(0)).toBe(0)
    // 首条带 time 的记录把 (time - firstTime) 归一化为 0
    expect(store.getElapsedTime(1)).toBe(0)
    // 之后的无 time 记录按样本间隔递增
    expect(store.getElapsedTime(2)).toBe(20)
  })

  it('uses the CSV header row as record keys and keeps it on the timeline', () => {
    const content = ['time,value', '1.0,10', '1.5,20'].join('\n')
    const { store, records } = buildTextTimeline(content, {
      parser: 'csv',
      sampleIntervalMs: 20,
      isCsv: true,
    })

    expect(store.length).toBe(3)
    expect(records).toHaveLength(2)
    expect(records[0]).toEqual({ epochIndex: 1, record: { time: 1.0, value: 10 } })
    // time 列驱动时间轴：相对首条记录 0.5s
    expect(store.getElapsedTime(1)).toBe(0)
    expect(store.getElapsedTime(2)).toBe(500)
  })

  it('strips console export prefixes before parsing', () => {
    const content = '12:00:01.000 [MSG ⬅️]: {"time": 2.0, "v": 7}\n12:00:02.000 [MSG ⬅️]: broken'
    const { store, records } = buildTextTimeline(content, {
      parser: 'json',
      sampleIntervalMs: 20,
      isCsv: false,
    })

    expect(store.length).toBe(2)
    expect(records).toHaveLength(1)
    expect(records[0].record).toEqual({ time: 2.0, v: 7 })
  })

  it('handles CRLF input and empty content', () => {
    const { store } = buildTextTimeline('a\r\nb\rc\n', {
      parser: 'json',
      sampleIntervalMs: 20,
      isCsv: false,
    })
    expect(store.length).toBe(3)

    expect(
      buildTextTimeline('', { parser: 'json', sampleIntervalMs: 20, isCsv: false }).store.length,
    ).toBe(0)
    expect(
      buildTextTimeline('\n \n', { parser: 'json', sampleIntervalMs: 20, isCsv: false }).store
        .length,
    ).toBe(0)
  })
})
