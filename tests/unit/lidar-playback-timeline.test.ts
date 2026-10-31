import { describe, expect, it } from 'vitest'
import { McapDocument } from '../../src/core/lidar/McapDocument'
import { PlaybackTimeline, availableStepModes } from '../../src/core/lidar/PlaybackTimeline'
import { buildMcapBytes, makeString, SCHEMA_STRING } from './helpers/lidarTestBag'

async function document(topics: Record<string, number[]>): Promise<McapDocument> {
  const bytes = await buildMcapBytes(
    Object.entries(topics).map(([topic, times]) => ({
      topic,
      schemaName: 'std_msgs/msg/String',
      schemaText: SCHEMA_STRING,
      messages: times.map((time) => ({ logTimeNs: BigInt(time), message: makeString('{}') })),
    })),
  )
  return McapDocument.load(bytes)
}

describe('PlaybackTimeline', () => {
  it('defaults to planner snapshots and keeps scan and event indices independently selectable', async () => {
    const doc = await document({
      '/scan_raw': [100, 200],
      '/planner_state': [120, 220],
      '/cmd_raw': [110, 210],
    })
    expect(availableStepModes(doc)).toEqual(['planner', 'scan', 'events'])
    const planner = new PlaybackTimeline(doc)
    expect(planner.mode).toBe('planner')
    expect(planner.total).toBe(2)
    expect(planner.timeForStep(100, 1)).toBe(120)
    expect(new PlaybackTimeline(doc, 'scan').timeForStep(120, 1)).toBe(200)
    expect(new PlaybackTimeline(doc, 'events').total).toBe(6)
    expect(new PlaybackTimeline(doc, 'events').timeForStep(120, 1)).toBe(200)
  })

  it('reports zero before the first selected event, one at the first, and never exceeds total', async () => {
    const timeline = new PlaybackTimeline(await document({ '/planner_state': [120, 220] }))
    expect([100, 120, 170, 220, 300].map((time) => timeline.positionAt(time))).toEqual([
      0, 1, 1, 2, 2,
    ])
    expect(timeline.timeForStep(100, -1)).toBeUndefined()
    expect(timeline.timeForStep(120, -1)).toBeUndefined()
    expect(timeline.timeForStep(300, 1)).toBeUndefined()
    expect(timeline.timeForStep(220, 1)).toBeUndefined()
  })

  it('moves strictly before or after arbitrary playhead times without skipping the preceding frame', async () => {
    const timeline = new PlaybackTimeline(await document({ '/planner_state': [120, 220, 420] }))
    expect(timeline.timeForStep(170, -1)).toBe(120)
    expect(timeline.timeForStep(170, 1)).toBe(220)
    expect(timeline.timeForStep(220, -1)).toBe(120)
    expect(timeline.timeForStep(220, 1)).toBe(420)
    expect(timeline.timeForStep(170, 10)).toBe(420)
    expect(timeline.timeForStep(300, -10)).toBe(120)
    expect(timeline.timeForStep(170, 0)).toBeUndefined()
  })

  it('deduplicates simultaneous source messages so stepping cannot get stuck on one timestamp', async () => {
    const timeline = new PlaybackTimeline(await document({ '/planner_state': [100, 100, 200] }))
    expect(timeline.total).toBe(2)
    expect(timeline.positionAt(100)).toBe(1)
    expect(timeline.timeForStep(100, 1)).toBe(200)
  })

  it('falls back to available source timestamps without synthesizing planner or scan frames', async () => {
    const legacy = await document({ '/scan_raw': [100, 200], '/cmd_raw': [110] })
    expect(new PlaybackTimeline(legacy).mode).toBe('scan')
    expect(availableStepModes(legacy)).toEqual(['scan', 'events'])
    const other = await document({ '/cmd_raw': [110, 210] })
    expect(new PlaybackTimeline(other).mode).toBe('events')
    expect(new PlaybackTimeline(other).total).toBe(2)
    expect(new PlaybackTimeline(legacy, 'events').mode).toBe('events')
  })

  it('handles empty and single-frame recordings at either boundary', async () => {
    const empty = new PlaybackTimeline(await document({ '/cmd_raw': [] }))
    expect(empty.total).toBe(0)
    expect(empty.positionAt(0)).toBe(0)
    expect(empty.timeForStep(0, 1)).toBeUndefined()
    const single = new PlaybackTimeline(await document({ '/scan_raw': [200] }))
    expect(single.timeForStep(100, 1)).toBe(200)
    expect(single.timeForStep(200, 1)).toBeUndefined()
    expect(single.timeForStep(200, -1)).toBeUndefined()
  })
})
