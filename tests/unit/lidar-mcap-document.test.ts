// McapDocument：索引、解码、播放头语义的单元测试。
// 输入为用 @mcap/core + MessageWriter 合成的、与板上 TraceSink 同构的 MCAP。
import { describe, expect, it } from 'vitest'
import { McapDocument } from '../../src/core/lidar/McapDocument'
import {
  SCHEMA_LASER_SCAN,
  SCHEMA_PATH,
  SCHEMA_STRING,
  SCHEMA_TWIST,
  buildMcapBytes,
  makeLaserScan,
  makePath,
  makeString,
  makeTwist,
  type BagChannelInput,
} from './helpers/lidarTestBag'

const BASE_NS = 1_000_000_000n // 任意单调时钟起点（非 epoch）

async function buildSampleDoc(): Promise<McapDocument> {
  const scans: BagChannelInput = {
    topic: '/scan_raw',
    schemaName: 'sensor_msgs/msg/LaserScan',
    schemaText: SCHEMA_LASER_SCAN,
    messages: [0, 1, 2].map((i) => ({
      logTimeNs: BASE_NS + BigInt(i) * 100_000_000n,
      message: makeLaserScan('laser', 100 + i, 0, [1, 2, 3]),
    })),
  }
  const paths: BagChannelInput = {
    topic: '/traj_candidates',
    schemaName: 'nav_msgs/msg/Path',
    schemaText: SCHEMA_PATH,
    // 板上形态：同一次规划的多条候选 = 同戳多条消息
    messages: [
      { logTimeNs: BASE_NS, message: makePath('base_link', 100, 0, [[0, 0], [1, 0]]) },
      { logTimeNs: BASE_NS, message: makePath('base_link', 100, 0, [[0, 0], [0.5, 0.5]]) },
      { logTimeNs: BASE_NS + 200_000_000n, message: makePath('base_link', 102, 0, [[0, 0], [2, 0]]) },
    ],
  }
  const cmds: BagChannelInput = {
    topic: '/cmd_raw',
    schemaName: 'geometry_msgs/msg/Twist',
    schemaText: SCHEMA_TWIST,
    messages: [0, 1].map((i) => ({
      logTimeNs: BASE_NS + BigInt(i) * 100_000_000n,
      message: makeTwist(0.2 + i, -0.1),
    })),
  }
  const scores: BagChannelInput = {
    topic: '/dwa_scores',
    schemaName: 'std_msgs/msg/String',
    schemaText: SCHEMA_STRING,
    messages: [{ logTimeNs: BASE_NS + 50_000_000n, message: makeString('{"frame":1,"best":0}') }],
  }
  const bytes = await buildMcapBytes([scans, paths, cmds, scores])
  return McapDocument.load(bytes)
}

describe('McapDocument', () => {
  it('建立话题索引并解码消息', async () => {
    const doc = await buildSampleDoc()
    expect(doc.topicNames()).toEqual(['/cmd_raw', '/dwa_scores', '/scan_raw', '/traj_candidates'])
    const scanInfo = doc.topicInfo('/scan_raw')!
    expect(scanInfo.messageCount).toBe(3)
    expect(scanInfo.schemaName).toBe('sensor_msgs/msg/LaserScan')
    expect(scanInfo.decodable).toBe(true)
    expect(scanInfo.firstLogTimeNs).toBe(Number(BASE_NS))
    expect(scanInfo.lastLogTimeNs).toBe(Number(BASE_NS + 200_000_000n))
    expect(doc.meta.problems).toEqual([])
  })

  it('解码 LaserScan 为结构化对象（TypedArray ranges）', async () => {
    const doc = await buildSampleDoc()
    const message = doc.decodeByIndex('/scan_raw', 1) as { angle_min: number; ranges: Float32Array } | undefined
    expect(message).toBeDefined()
    expect(message!.ranges).toBeInstanceOf(Float32Array)
    expect([...message!.ranges]).toEqual([1, 2, 3])
  })

  it('播放头语义：取之前最近一条', async () => {
    const doc = await buildSampleDoc()
    const before = doc.decodeAtOrBefore('/scan_raw', Number(BASE_NS) + 150_000_000)
    expect(before?.index).toBe(1)
    const earliest = doc.decodeAtOrBefore('/scan_raw', Number(BASE_NS) - 1)
    expect(earliest).toBeUndefined()
    const exact = doc.decodeAtOrBefore('/cmd_raw', Number(BASE_NS) + 100_000_000)
    expect(exact?.index).toBe(1)
  })

  it('同戳多条候选消息全部取回', async () => {
    const doc = await buildSampleDoc()
    const candidates = doc.decodeAllAtOrBefore('/traj_candidates', Number(BASE_NS) + 10_000_000)
    expect(candidates).toHaveLength(2)
    const later = doc.decodeAllAtOrBefore('/traj_candidates', Number(BASE_NS) + 200_000_000)
    expect(later).toHaveLength(1)
    expect(later[0].index).toBe(2)
  })

  it('全局时间点支持逐帧步进', async () => {
    const doc = await buildSampleDoc()
    // 全局时间点：100.0s(scan/cand) 100.05s(scores) 100.1s(scan+cmd) 101.1s 100.2s? 合并为升序去重
    expect(doc.nextTimeAfter(Number(BASE_NS))).toBe(Number(BASE_NS) + 50_000_000)
    expect(doc.prevTimeBefore(Number(BASE_NS) + 50_000_000)).toBe(Number(BASE_NS))
    expect(doc.nextTimeAfter(Number(BASE_NS) + 200_000_000)).toBeUndefined()
  })

  it('字符串消息解码为 { data }', async () => {
    const doc = await buildSampleDoc()
    const message = doc.decodeByIndex('/dwa_scores', 0) as { data: string } | undefined
    expect(message?.data).toBe('{"frame":1,"best":0}')
  })

  it('损坏数据返回 undefined 而非抛出', async () => {
    const doc = await buildSampleDoc()
    expect(doc.decodeByIndex('/不存在的topic', 0)).toBeUndefined()
    expect(doc.decodeByIndex('/scan_raw', 9999)).toBeUndefined()
  })
})
