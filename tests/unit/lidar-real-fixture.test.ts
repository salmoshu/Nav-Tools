// 真实板端录像的字段级校验：tests/fixtures/lidar/trace-selftest.mcap 是 E-Wagon-Lidar
// v1.1.0 trace_sink --trace-selftest 的真实产物（libmcap 2.1.3 + 手写 CDR），
// 与合成 bag（lidarTestBag.ts）互为印证，打破“写读同库”的自证循环。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { McapDocument } from '../../src/core/lidar/McapDocument'
import { LIDAR_TOPICS } from '../../src/core/lidar/SceneFrame'

const FIXTURE = 'tests/fixtures/lidar/trace-selftest.mcap'

async function loadDoc(): Promise<McapDocument> {
  return McapDocument.load(new Uint8Array(readFileSync(FIXTURE)))
}

describe('真实板端录像 trace-selftest.mcap 字段级校验', () => {
  it('12 个板端通道全部存在且有消息', async () => {
    const doc = await loadDoc()
    for (const topic of Object.values(LIDAR_TOPICS)) {
      expect(doc.topicInfo(topic)?.messageCount ?? 0, topic).toBeGreaterThan(0)
    }
    expect(doc.startNs).toBeDefined()
    expect(doc.endNs!).toBeGreaterThan(doc.startNs!)
  })

  it('LaserScan：360 点、1° 角分辨率、量程 0.1~12 m', async () => {
    const doc = await loadDoc()
    const scan = doc.decodeByIndex(LIDAR_TOPICS.scanRaw, 0) as {
      ranges: number[]
      angle_min: number
      angle_increment: number
      range_min: number
      range_max: number
    }
    expect(scan.ranges).toHaveLength(360)
    expect(scan.angle_increment).toBeCloseTo(Math.PI / 180, 4)
    expect(scan.angle_min).toBeCloseTo(-Math.PI, 2)
    expect(scan.range_min).toBeCloseTo(0.1, 3)
    expect(scan.range_max).toBeCloseTo(12, 1)
  })

  it('PointCloud2：point_step=12、x/y/z 为 float32 且 offset 0/4/8', async () => {
    const doc = await loadDoc()
    const cloud = doc.decodeByIndex(LIDAR_TOPICS.obstacles, 0) as {
      point_step: number
      fields: { name: string; offset: number; datatype: number }[]
    }
    expect(cloud.point_step).toBe(12)
    const fields = Object.fromEntries(cloud.fields.map((field) => [field.name, field]))
    expect(fields.x.offset).toBe(0)
    expect(fields.y.offset).toBe(4)
    expect(fields.z.offset).toBe(8)
    for (const name of ['x', 'y', 'z']) expect(fields[name].datatype).toBe(7)
  })

  it('/tf：base_link → laser 平移 x=0.75', async () => {
    const doc = await loadDoc()
    const tf = doc.decodeByIndex(LIDAR_TOPICS.tf, 0) as {
      // 板上 schema 的 TransformStamped 首字段叫 stamp（非标准 ROS 的 header）
      transforms: {
        child_frame_id: string
        stamp: { frame_id: string }
        transform: { translation: { x: number; y: number } }
      }[]
    }
    const laser = tf.transforms.find((entry) => entry.child_frame_id === 'laser')
    expect(laser).toBeDefined()
    expect(laser!.stamp.frame_id).toBe('base_link')
    expect(laser!.transform.translation.x).toBeCloseTo(0.75, 6)
    expect(laser!.transform.translation.y).toBeCloseTo(0, 6)
  })

  it('footprint：真实轮廓前 0.80/后 -0.08/半宽 0.24，裕量版四边外扩 0.15', async () => {
    const doc = await loadDoc()
    const footprint = doc.decodeByIndex(LIDAR_TOPICS.footprint, 0) as {
      polygon: { points: { x: number; y: number }[] }
    }
    const margin = doc.decodeByIndex(LIDAR_TOPICS.footprintMargin, 0) as {
      polygon: { points: { x: number; y: number }[] }
    }
    expect(footprint.polygon.points.length).toBeGreaterThanOrEqual(4)
    const xs = footprint.polygon.points.map((point) => point.x)
    const ys = footprint.polygon.points.map((point) => point.y)
    expect(Math.max(...xs)).toBeCloseTo(0.8, 6)
    expect(Math.min(...xs)).toBeCloseTo(-0.08, 6)
    expect(Math.max(...ys)).toBeCloseTo(0.24, 6)
    expect(Math.min(...ys)).toBeCloseTo(-0.24, 6)
    const mxs = margin.polygon.points.map((point) => point.x)
    const mys = margin.polygon.points.map((point) => point.y)
    expect(Math.max(...mxs)).toBeCloseTo(0.95, 6)
    expect(Math.min(...mxs)).toBeCloseTo(-0.23, 6)
    expect(Math.max(...mys)).toBeCloseTo(0.39, 6)
    expect(Math.min(...mys)).toBeCloseTo(-0.39, 6)
  })

  it('Metadata 含板端会话指纹 e_wagon_lidar_session', async () => {
    const doc = await loadDoc()
    const session = doc.meta.metadata.find((entry) => entry.name === 'e_wagon_lidar_session')
    expect(session).toBeDefined()
    expect(session!.data).toHaveProperty('dwa_lidar_offset_x')
  })

  it('dwa_scores：JSON 含逐候选评分明细', async () => {
    const doc = await loadDoc()
    const message = doc.decodeByIndex(LIDAR_TOPICS.scores, 0) as { data: string }
    const scores = JSON.parse(message.data) as {
      success: boolean
      best: number
      candidates: { v: number; w: number; collision: boolean }[]
    }
    expect(scores.success).toBe(true)
    expect(Array.isArray(scores.candidates)).toBe(true)
    expect(scores.candidates.length).toBeGreaterThan(0)
    expect(scores.best).toBeGreaterThanOrEqual(0)
  })
})
