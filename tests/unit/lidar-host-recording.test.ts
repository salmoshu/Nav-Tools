// Cross-repository wire test. Run with HOST_TRACE_MCAP=<actual Host part>.
// Optional so the normal Nav-Tools suite does not depend on a Host checkout.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { McapDocument } from '../../src/core/lidar/McapDocument'
import { buildSceneFrameData } from '../../src/core/lidar/SceneFrame'
import type { CurrentFrame, CurrentMessage } from '../../src/core/lidar/types'

const input = process.env.HOST_TRACE_MCAP
function frameAt(doc: McapDocument, timeNs: number): CurrentFrame {
  const entries = new Map<string, CurrentMessage>()
  for (const topic of doc.topicNames()) {
    const entry = doc.decodeAtOrBefore(topic, timeNs)
    if (entry) entries.set(topic, entry)
  }
  return { timeNs, entries }
}
async function sample() {
  const doc = await McapDocument.load(new Uint8Array(readFileSync(input!)))
  const count = doc.topicInfo('/target')?.messageCount ?? 0
  for (let i = 0; i < count; i++) {
    const target = doc.decodeByIndex('/target', i) as { poses?: unknown[] }
    if (target.poses?.length !== 1) continue
    const timeNs = doc.timeAt('/target', i)
    const frame = frameAt(doc, timeNs)
    return { doc, scene: buildSceneFrameData(doc, frame) }
  }
  throw new Error('No valid observed target in Host MCAP')
}

describe.skipIf(!input)('actual Host MCAP without Lidar', () => {
  it('shows the recorded rectangular vehicle body', async () => {
    const { scene } = await sample()
    expect(scene.footprintXY?.length).toBe(8)
  })
  it('shows the live target using an exact recorded transform', async () => {
    const { scene } = await sample()
    expect(scene.targetXY).toBeDefined()
    expect(scene.warnings.some((w) => w.includes('/target'))).toBe(false)
  })
  it('shows every valid target and clears every empty observation throughout the part', async () => {
    const doc = await McapDocument.load(new Uint8Array(readFileSync(input!)))
    const count = doc.topicInfo('/target')?.messageCount ?? 0
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const target = doc.decodeByIndex('/target', i) as { poses: unknown[] }
      const scene = buildSceneFrameData(doc, frameAt(doc, doc.timeAt('/target', i)))
      expect(scene.targetXY !== undefined, `target frame ${i}`).toBe(target.poses.length === 1)
      expect(scene.footprintXY?.length, `body frame ${i}`).toBe(8)
    }
  })
})
