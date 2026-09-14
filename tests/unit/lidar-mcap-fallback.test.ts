// McapDocument 增强：截断/无索引流式回退、多分片归并、压缩提示、垃圾输入。
// 截断用例基于真实板端录像 tests/fixtures/lidar/trace-selftest.mcap
// （libmcap 2.1.3 / ros2 / 无压缩 chunk / 763 条消息 / 12 通道）。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { McapDocument } from '../../src/core/lidar/McapDocument'
import { buildPlotSeries } from '../../src/core/lidar/LidarSeries'
import {
  SCHEMA_LASER_SCAN,
  SCHEMA_TF_MESSAGE,
  buildMcapBytes,
  makeLaserScan,
  makeTf,
  type BagChannelInput,
} from './helpers/lidarTestBag'

const FIXTURE_PATH = 'tests/fixtures/lidar/trace-selftest.mcap'
const BASE_NS = 1_000_000_000n
const MS = 1_000_000n

interface ScanMessage {
  ranges: Float32Array
}
interface TfMessage {
  transforms: { transform: { translation: { x: number } } }[]
}

function fixtureBytes(): Uint8Array {
  const buffer = readFileSync(FIXTURE_PATH)
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

function totalMessages(doc: McapDocument): number {
  return doc.meta.topics.reduce((sum, info) => sum + info.messageCount, 0)
}

function scanChannel(offsetsMs: number[]): BagChannelInput {
  return {
    topic: '/scan_raw',
    schemaName: 'sensor_msgs/msg/LaserScan',
    schemaText: SCHEMA_LASER_SCAN,
    messages: offsetsMs.map((offset) => ({
      logTimeNs: BASE_NS + BigInt(offset) * MS,
      // ranges 标记来源时间（ms），归并测试据此辨认消息来自哪一片
      message: makeLaserScan('laser', 100 + offset, 0, [offset]),
    })),
  }
}

function fatScanChannel(offsetsMs: number[]): BagChannelInput {
  return {
    topic: '/scan_raw',
    schemaName: 'sensor_msgs/msg/LaserScan',
    schemaText: SCHEMA_LASER_SCAN,
    messages: offsetsMs.map((offset) => ({
      logTimeNs: BASE_NS + BigInt(offset) * MS,
      // 大负载让 chunk 占据文件主体，60% 切断点必然落在 chunk 内
      message: makeLaserScan('laser', 100 + offset, 0, new Array(600).fill(1)),
    })),
  }
}

function tfChannel(offsetMs: number, laserOffsetX: number): BagChannelInput {
  return {
    topic: '/tf',
    schemaName: 'tf2_msgs/msg/TFMessage',
    schemaText: SCHEMA_TF_MESSAGE,
    messages: [{ logTimeNs: BASE_NS + BigInt(offsetMs) * MS, message: makeTf(laserOffsetX, 100, 0) }],
  }
}

async function buildParts(): Promise<{ partA: Uint8Array; partB: Uint8Array }> {
  // 两片时间错开：A 含 0/400ms，B 含 100/300ms；各自首开都补发 /tf（板端轮换形态）
  const partA = await buildMcapBytes([scanChannel([0, 400]), tfChannel(0, 0.75)], {
    metadata: [{ name: 'e_wagon_lidar_session', data: { part: '0', app_version: '1.1.0' } }],
  })
  const partB = await buildMcapBytes([scanChannel([100, 300]), tfChannel(100, 0.8)], {
    metadata: [{ name: 'e_wagon_lidar_session', data: { part: '1', app_version: '1.1.0' } }],
  })
  return { partA, partB }
}

describe('McapDocument 截断回退', () => {
  it('完整录像保持索引路径且标记完整', async () => {
    const doc = await McapDocument.load(fixtureBytes())
    expect(doc.truncated).toBe(false)
    expect(doc.meta.truncated).toBe(false)
    expect(doc.meta.problems).toEqual([])
    expect(totalMessages(doc)).toBe(763)
    expect(doc.meta.profile).toBe('ros2')
    expect(doc.meta.library).toBe('libmcap 2.1.3')
    expect(doc.meta.metadata).toHaveLength(1)
    expect(doc.meta.metadata[0].name).toBe('e_wagon_lidar_session')
    expect(doc.meta.metadata[0].partIndex).toBeUndefined()
  })

  it('50% 截断：流式回退挽回前段消息并标记不完整', async () => {
    const bytes = fixtureBytes()
    const doc = await McapDocument.load(bytes.subarray(0, Math.floor(bytes.byteLength * 0.5)))
    expect(doc.truncated).toBe(true)
    expect(doc.meta.truncated).toBe(true)
    // 实测：首个 chunk 完整保留，373/763 条可挽回
    expect(totalMessages(doc)).toBe(373)
    expect(doc.topicNames()).toHaveLength(12)
    expect(doc.meta.problems.some((p) => p.includes('文件不完整') && p.includes('373'))).toBe(true)
    expect(doc.meta.metadata.map((entry) => entry.name)).toContain('e_wagon_lidar_session')
    const scan = doc.decodeByIndex('/scan_raw', 0) as ScanMessage | undefined
    expect(scan).toBeDefined()
    expect(scan!.ranges).toBeInstanceOf(Float32Array)
    expect(scan!.ranges.length).toBeGreaterThan(0)
  })

  it('80% 截断：同样可加载且为部分消息', async () => {
    const bytes = fixtureBytes()
    const doc = await McapDocument.load(bytes.subarray(0, Math.floor(bytes.byteLength * 0.8)))
    expect(doc.truncated).toBe(true)
    const total = totalMessages(doc)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThan(763)
    expect(doc.meta.problems.some((p) => p.includes('文件不完整'))).toBe(true)
  })

  it('截断文档照常支撑序列预提取与播放头语义', async () => {
    const bytes = fixtureBytes()
    const doc = await McapDocument.load(bytes.subarray(0, Math.floor(bytes.byteLength * 0.5)))
    const series = buildPlotSeries(doc)
    expect(series.cmd.t.length).toBeGreaterThan(0)
    expect(series.odom.t.length).toBeGreaterThan(0)
    expect(series.scores.t.length).toBeGreaterThan(0)
    const startNs = doc.startNs!
    expect(doc.decodeAtOrBefore('/tf', startNs)).toBeDefined()
    expect(doc.decodeAtOrBefore('/scan_raw', startNs)).toBeDefined()
    expect(doc.nextTimeAfter(startNs)).toBeGreaterThan(startNs)
  })

  it('无解压器的压缩 chunk 给出可读提示（0 消息但 ready）', async () => {
    const bytes = await buildMcapBytes([scanChannel([0, 100])], {
      compressChunk: (chunkData) => ({ compression: 'lz4', compressedData: chunkData }),
    })
    const doc = await McapDocument.load(bytes)
    expect(doc.truncated).toBe(false)
    expect(totalMessages(doc)).toBe(0)
    expect(doc.topicNames()).toContain('/scan_raw')
    expect(doc.meta.problems.some((p) => p.includes('lz4') && p.includes('解压'))).toBe(true)
  })
})

describe('McapDocument 多分片归并', () => {
  it('两片消息按 logTime 归并排序进同一索引', async () => {
    const { partA, partB } = await buildParts()
    const doc = await McapDocument.load([partA, partB])
    expect(doc.truncated).toBe(false)
    expect(doc.meta.problems).toEqual([])
    const scanInfo = doc.topicInfo('/scan_raw')!
    expect(scanInfo.messageCount).toBe(4)
    expect(scanInfo.firstLogTimeNs).toBe(Number(BASE_NS))
    expect(scanInfo.lastLogTimeNs).toBe(Number(BASE_NS + 400n * MS))
    const expected = [0, 100, 300, 400].map((offset) => Number(BASE_NS + BigInt(offset) * MS))
    expect([0, 1, 2, 3].map((index) => doc.timeAt('/scan_raw', index))).toEqual(expected)
    // 归并后同话题只有一条索引（channelId 取首片），不是每片一条
    expect(doc.meta.topics.filter((info) => info.topic === '/scan_raw')).toHaveLength(1)
    expect(doc.topicInfo('/tf')!.messageCount).toBe(2)
    expect(doc.startNs).toBe(Number(BASE_NS))
    expect(doc.endNs).toBe(Number(BASE_NS + 400n * MS))
    // 归并后按时间序各片消息内容完好（ranges 标记来源毫秒偏移）
    const markers = [0, 100, 300, 400]
    for (let index = 0; index < 4; index++) {
      const scan = doc.decodeByIndex('/scan_raw', index) as ScanMessage
      expect([...scan.ranges]).toEqual([markers[index]])
    }
  })

  it('分片乱序传入仍按时间归并（首末时间取排序后极值）', async () => {
    const { partA, partB } = await buildParts()
    const doc = await McapDocument.load([partB, partA])
    const scanInfo = doc.topicInfo('/scan_raw')!
    expect(scanInfo.messageCount).toBe(4)
    // 到达序首条是 B 片 100ms，但首末时间必须取全局极值
    expect(scanInfo.firstLogTimeNs).toBe(Number(BASE_NS))
    expect(scanInfo.lastLogTimeNs).toBe(Number(BASE_NS + 400n * MS))
    expect(doc.startNs).toBe(Number(BASE_NS))
    const expected = [0, 100, 300, 400].map((offset) => Number(BASE_NS + BigInt(offset) * MS))
    expect([0, 1, 2, 3].map((index) => doc.timeAt('/scan_raw', index))).toEqual(expected)
  })

  it('跨片 at-or-before 与逐帧步进正确', async () => {
    const { partA, partB } = await buildParts()
    const doc = await McapDocument.load([partA, partB])
    // 250ms 处取到的是 B 片 100ms 的消息
    const at250 = doc.decodeAtOrBefore('/scan_raw', Number(BASE_NS + 250n * MS))!
    expect(at250.index).toBe(1)
    expect(at250.logTimeNs).toBe(Number(BASE_NS + 100n * MS))
    // /tf 每片各一条：50ms 处是 A 片的（0.75），400ms 处是 B 片的（0.8）
    const tfEarly = doc.decodeAtOrBefore('/tf', Number(BASE_NS + 50n * MS))!.message as TfMessage
    expect(tfEarly.transforms[0].transform.translation.x).toBe(0.75)
    const tfLate = doc.decodeAtOrBefore('/tf', Number(BASE_NS + 400n * MS))!.message as TfMessage
    expect(tfLate.transforms[0].transform.translation.x).toBe(0.8)
    // decodeAllAtOrBefore 取“最后一个有效时刻”的同戳组：400ms 处仅 1 条
    expect(doc.decodeAllAtOrBefore('/scan_raw', Number(BASE_NS + 400n * MS))).toHaveLength(1)
    expect(doc.nextTimeAfter(Number(BASE_NS + 100n * MS))).toBe(Number(BASE_NS + 300n * MS))
    expect(doc.prevTimeBefore(Number(BASE_NS + 300n * MS))).toBe(Number(BASE_NS + 100n * MS))
  })

  it('各分片 Metadata 保留并带 partIndex', async () => {
    const { partA, partB } = await buildParts()
    const doc = await McapDocument.load([partA, partB])
    expect(doc.meta.metadata).toHaveLength(2)
    expect(doc.meta.metadata[0]).toMatchObject({ name: 'e_wagon_lidar_session', partIndex: 0 })
    expect(doc.meta.metadata[0].data.part).toBe('0')
    expect(doc.meta.metadata[1]).toMatchObject({ name: 'e_wagon_lidar_session', partIndex: 1 })
    expect(doc.meta.metadata[1].data.part).toBe('1')
  })

  it('单元素数组与单份调用等价', async () => {
    const { partA } = await buildParts()
    const doc = await McapDocument.load([partA])
    expect(doc.topicInfo('/scan_raw')!.messageCount).toBe(2)
    expect(doc.meta.problems).toEqual([])
    expect(doc.meta.metadata).toHaveLength(1)
    expect(doc.meta.metadata[0].partIndex).toBeUndefined()
  })

  it('问题条目带分片标识', async () => {
    const partA = await buildMcapBytes([scanChannel([0, 400]), tfChannel(0, 0.75)])
    const partB = await buildMcapBytes([fatScanChannel([100, 300]), tfChannel(100, 0.8)])
    const cutB = partB.subarray(0, Math.floor(partB.byteLength * 0.6))
    const doc = await McapDocument.load([partA, cutB])
    expect(doc.truncated).toBe(true)
    expect(doc.meta.problems.some((p) => p.startsWith('[part_1]') && p.includes('文件不完整'))).toBe(true)
    // part_0 完好；part_1 的 chunk 不完整，只能收回 schema/channel（0 条消息）
    expect(doc.topicInfo('/scan_raw')!.messageCount).toBe(2)
    expect(doc.topicInfo('/tf')!.messageCount).toBe(1)
    expect(doc.meta.problems.every((p) => !p.startsWith('[part_0]'))).toBe(true)
  })
})

describe('McapDocument 垃圾输入', () => {
  it('全非 MCAP 字节抛出可读错误', async () => {
    const garbage = new Uint8Array(64).map((_, index) => (index * 7 + 13) & 0xff)
    await expect(McapDocument.load(garbage)).rejects.toThrow(/不是有效的 MCAP/)
  })

  it('空字节与空数组抛出可读错误', async () => {
    await expect(McapDocument.load(new Uint8Array(0))).rejects.toThrow(/不是有效的 MCAP/)
    await expect(McapDocument.load([])).rejects.toThrow(/未提供任何文件字节/)
  })
})
