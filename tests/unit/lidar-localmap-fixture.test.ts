// 车端真实样例 localmap-sample.mcap 的字段级联调校验。
// 文件为 E-Wagon-Lidar trace_sink 真实产物（14 通道：既有 12 + /local_map、
// /local_map_path），与合成 bag（lidar-local-map.test.ts）互为印证。
// 探针事实（2026-10-11，经 McapDocument 全管线解码 dump）：
// - /local_map：17 条，160×160、resolution≈0.05、origin (-4,-4) 恒等旋转；
//   data 解为 Int8Array（int8 符号正确），值仅 -1/0/100，长度恒等于 width*height
// - /local_map_path：17 条，每条 4 个 pose
// - /dwa_scores：50 条，均带顶层 local_map 组（JSON 布尔值）
// - /scan_raw 通道注册在案但 0 条消息（板上该次录制未发）
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { McapDocument } from '../../src/core/lidar/McapDocument'
import { buildSceneFrameData, LIDAR_TOPICS } from '../../src/core/lidar/SceneFrame'
import { parseDwaScores } from '../../src/core/lidar/DwaScores'
import {
  asOccupancyGrid,
  asPath,
  CELL_FREE,
  CELL_OCCUPIED,
  CELL_UNKNOWN,
  normalizeOccupancyCells,
} from '../../src/core/lidar/LidarGeometry'
import type { CurrentFrame, CurrentMessage } from '../../src/core/lidar/types'

const FIXTURE = 'tests/fixtures/lidar/localmap-sample.mcap'

async function loadDoc(): Promise<McapDocument> {
  return McapDocument.load(new Uint8Array(readFileSync(FIXTURE)))
}

function frameAt(doc: McapDocument, timeNs: number): CurrentFrame {
  const entries = new Map<string, CurrentMessage>()
  for (const topic of doc.topicNames()) {
    const message = doc.decodeAtOrBefore(topic, timeNs)
    if (message) entries.set(topic, message)
  }
  return { timeNs, entries }
}

describe('真实车端样例 localmap-sample.mcap 联调校验', () => {
  it('14 通道齐全：既有 12 + local_map 双通道', async () => {
    const doc = await loadDoc()
    expect(doc.meta.topics).toHaveLength(14)
    for (const topic of Object.values(LIDAR_TOPICS)) {
      expect(doc.topicInfo(topic), topic).toBeDefined()
    }
    // 除 /scan_raw（通道注册在案但该次录制 0 条）外均有消息
    for (const topic of Object.values(LIDAR_TOPICS)) {
      if (topic === LIDAR_TOPICS.scanRaw) continue
      expect(doc.topicInfo(topic)!.messageCount, topic).toBeGreaterThan(0)
    }
    expect(doc.topicInfo(LIDAR_TOPICS.scanRaw)!.messageCount).toBe(0)
    expect(doc.meta.problems).toHaveLength(0)
    expect(doc.meta.truncated).toBe(false)
  })

  it('/local_map 多条可解：结构完整、data 长度 == width*height、值域 int8 合法', async () => {
    const doc = await loadDoc()
    const count = doc.topicInfo(LIDAR_TOPICS.localMap)!.messageCount
    expect(count).toBeGreaterThan(1)
    for (let index = 0; index < count; index++) {
      const grid = asOccupancyGrid(doc.decodeByIndex(LIDAR_TOPICS.localMap, index))
      expect(grid, `msg ${index}`).toBeDefined()
      const { resolution, width, height } = grid!.info
      expect(width).toBe(160)
      expect(height).toBe(160)
      expect(resolution).toBeCloseTo(0.05, 6)
      expect(grid!.info.origin.position).toBeDefined()
      expect(grid!.data.length).toBe(width * height)
      // 逐格 expect 太慢（17×25600），聚合后断言一次
      let min = 127
      let max = -128
      for (let i = 0; i < grid!.data.length; i++) {
        const value = grid!.data[i]
        if (value < min) min = value
        if (value > max) max = value
      }
      expect(min, `msg ${index} min`).toBeGreaterThanOrEqual(-1)
      expect(max, `msg ${index} max`).toBeLessThanOrEqual(100)
    }
  })

  it('int8 符号链路：data 解为带符号 Int8Array，未知格为 -1（不是 255），无需映射', async () => {
    const doc = await loadDoc()
    const grid = asOccupancyGrid(doc.decodeByIndex(LIDAR_TOPICS.localMap, 0))!
    // rosmsg2-serialization 对 int8[] 直接产出 Int8Array：符号在 CDR→解码链路中天然正确
    expect(grid.data).toBeInstanceOf(Int8Array)
    let min = 127
    let max = -128
    const counts = new Map<number, number>()
    for (let i = 0; i < grid.data.length; i++) {
      const value = grid.data[i]
      min = Math.min(min, value)
      max = Math.max(max, value)
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    // 若为无符号误读，未知格会是 255 且不存在任何负值
    expect(min).toBe(-1)
    expect(max).toBe(100)
    expect(counts.get(-1) ?? 0).toBeGreaterThan(0)
    expect(counts.get(255)).toBeUndefined()
  })

  it('normalizeOccupancyCells 对真实数据：三态分布合理且有占据格', async () => {
    const doc = await loadDoc()
    const count = doc.topicInfo(LIDAR_TOPICS.localMap)!.messageCount
    let sawOccupied = false
    for (let index = 0; index < count; index++) {
      const grid = asOccupancyGrid(doc.decodeByIndex(LIDAR_TOPICS.localMap, index))!
      const cells = normalizeOccupancyCells(grid.data, grid.info.width, grid.info.height)!
      expect(cells.length).toBe(160 * 160)
      const dist = [0, 0, 0]
      for (let i = 0; i < cells.length; i++) dist[cells[i]]++
      expect(dist[CELL_UNKNOWN]).toBeGreaterThan(0)
      expect(dist[CELL_FREE]).toBeGreaterThan(0)
      expect(dist[CELL_UNKNOWN] + dist[CELL_FREE] + dist[CELL_OCCUPIED]).toBe(cells.length)
      if (dist[CELL_OCCUPIED] > 0) sawOccupied = true
    }
    expect(sawOccupied).toBe(true)
  })

  it('/local_map_path 多条可解：poses 非空、坐标有限', async () => {
    const doc = await loadDoc()
    const count = doc.topicInfo(LIDAR_TOPICS.localMapPath)!.messageCount
    expect(count).toBeGreaterThan(1)
    for (let index = 0; index < count; index++) {
      const path = asPath(doc.decodeByIndex(LIDAR_TOPICS.localMapPath, index))
      expect(path, `msg ${index}`).toBeDefined()
      expect(path!.poses.length).toBeGreaterThan(0)
      for (const pose of path!.poses) {
        expect(Number.isFinite(pose.pose.position.x)).toBe(true)
        expect(Number.isFinite(pose.pose.position.y)).toBe(true)
      }
    }
  })

  it('SceneFrame 装配：localMap/localMapPathXY 齐备且无 warnings', async () => {
    const doc = await loadDoc()
    const frame = buildSceneFrameData(doc, frameAt(doc, doc.endNs!))
    expect(frame.localMap).toBeDefined()
    expect(frame.localMap!.width).toBe(160)
    expect(frame.localMap!.height).toBe(160)
    expect(frame.localMap!.originX).toBeCloseTo(-4, 6)
    expect(frame.localMap!.originY).toBeCloseTo(-4, 6)
    expect(frame.localMap!.originYaw).toBeCloseTo(0, 6)
    expect(frame.localMapPathXY).toBeDefined()
    expect(frame.localMapPathXY!.length).toBeGreaterThanOrEqual(4)
    expect(frame.warnings).toHaveLength(0)
  })

  it('/dwa_scores 真实消息解析出 local_map 组（含非默认值）', async () => {
    const doc = await loadDoc()
    const count = doc.topicInfo(LIDAR_TOPICS.scores)!.messageCount
    let withGroup = 0
    let sawNonDefault = false
    for (let index = 0; index < count; index++) {
      const message = doc.decodeByIndex(LIDAR_TOPICS.scores, index) as { data?: unknown }
      const scores = typeof message?.data === 'string' ? parseDwaScores(message.data) : undefined
      if (!scores?.local_map) continue
      withGroup++
      const { blk, nav_hold, nav_reason, memory_paused } = scores.local_map
      if (blk || nav_hold || nav_reason !== '' || memory_paused) sawNonDefault = true
    }
    expect(withGroup).toBeGreaterThan(0)
    expect(sawNonDefault).toBe(true)
    // 首条实际值（探针 dump）：blk=true、nav_reason="tracking"
    const first = doc.decodeByIndex(LIDAR_TOPICS.scores, 0) as { data: string }
    const firstScores = parseDwaScores(first.data)!
    expect(firstScores.local_map).toEqual({
      blk: true,
      nav_hold: false,
      nav_reason: 'tracking',
      memory_paused: false,
    })
  })
})
