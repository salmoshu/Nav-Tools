// local_map 占据栅格与 A* 路径：SceneFrame 装配（OccupancyGrid→渲染视图）与
// /dwa_scores 新增 local_map 嵌套组字段解析的单元测试。
// 夹具与既有 lidar-* 测试同模式：代码合成同构 MCAP（lidarTestBag）。
import { describe, expect, it } from 'vitest'
import { McapDocument } from '../../src/core/lidar/McapDocument'
import { buildSceneFrameData } from '../../src/core/lidar/SceneFrame'
import { LOCAL_MAP_SCORE_KEYS, parseDwaScores } from '../../src/core/lidar/DwaScores'
import {
  CELL_FREE,
  CELL_OCCUPIED,
  CELL_UNKNOWN,
  normalizeOccupancyCells,
  occupancyOriginPose,
  asOccupancyGrid,
} from '../../src/core/lidar/LidarGeometry'
import type { CurrentFrame, CurrentMessage } from '../../src/core/lidar/types'
import {
  SCHEMA_OCCUPANCY_GRID,
  SCHEMA_ODOMETRY,
  SCHEMA_PATH,
  buildMcapBytes,
  makeOccupancyGrid,
  makeOdometry,
  makePath,
  type BagChannelInput,
} from './helpers/lidarTestBag'

const BASE = 1_000_000_000n

/** 车体在 odom (10,0) 朝 +x；栅格 origin (2,3) yaw=90°，4×3、0.5m；A* 路径两个点。 */
async function buildLocalMapDoc(options: { shortData?: boolean } = {}): Promise<McapDocument> {
  const cells = [
    100, 0, -1, 65, // 第一行：占据 / 空闲 / 未知 / 阈值占据
    64, 1, -128, 0, // 第二行：阈值下空闲 / 空闲 / 未知 / 空闲
    100, 100, 0, -1,
  ]
  const localMap: BagChannelInput = {
    topic: '/local_map',
    schemaName: 'nav_msgs/msg/OccupancyGrid',
    schemaText: SCHEMA_OCCUPANCY_GRID,
    messages: [
      {
        logTimeNs: BASE,
        message: makeOccupancyGrid(
          'odom_est',
          0,
          0,
          0.5,
          4,
          3,
          { x: 2, y: 3, yaw: Math.PI / 2 },
          options.shortData ? cells.slice(0, 6) : cells,
        ),
      },
    ],
  }
  const localMapPath: BagChannelInput = {
    topic: '/local_map_path',
    schemaName: 'nav_msgs/msg/Path',
    schemaText: SCHEMA_PATH,
    messages: [{ logTimeNs: BASE, message: makePath('odom_est', 0, 0, [[1, 1], [2.5, 1.5]]) }],
  }
  const odom: BagChannelInput = {
    topic: '/odom_est',
    schemaName: 'nav_msgs/msg/Odometry',
    schemaText: SCHEMA_ODOMETRY,
    messages: [{ logTimeNs: BASE, message: makeOdometry('odom_est', 0, 0, 10, 0, 0, 0.2, 0) }],
  }
  const bytes = await buildMcapBytes([localMap, localMapPath, odom])
  return McapDocument.load(bytes)
}

function frameAt(doc: McapDocument, timeNs: number): CurrentFrame {
  const entries = new Map<string, CurrentMessage>()
  for (const topic of doc.topicNames()) {
    const message = doc.decodeAtOrBefore(topic, timeNs)
    if (message) entries.set(topic, message)
  }
  return { timeNs, entries }
}

describe('OccupancyGrid → LocalMapView', () => {
  it('schema 驱动解码：栅格元信息按 origin 原样摆放（不走 base 变换链）', async () => {
    const doc = await buildLocalMapDoc()
    const frame = buildSceneFrameData(doc, frameAt(doc, Number(BASE)))
    const map = frame.localMap
    expect(map).toBeDefined()
    expect(map!.resolution).toBeCloseTo(0.5, 6)
    expect(map!.width).toBe(4)
    expect(map!.height).toBe(3)
    // 车体在 (10,0)，但栅格 origin 已在 odom 系，不得再叠加里程计位姿
    expect(map!.originX).toBeCloseTo(2, 6)
    expect(map!.originY).toBeCloseTo(3, 6)
    expect(map!.originYaw).toBeCloseTo(Math.PI / 2, 6)
  })

  it('cell 三态归一：100→占据，0→空闲，-1→未知，中间值按阈值归类', async () => {
    const doc = await buildLocalMapDoc()
    const frame = buildSceneFrameData(doc, frameAt(doc, Number(BASE)))
    const cells = frame.localMap!.cells
    expect(cells).toBeInstanceOf(Uint8Array)
    expect(cells.length).toBe(12)
    expect([...cells]).toEqual([
      CELL_OCCUPIED, CELL_FREE, CELL_UNKNOWN, CELL_OCCUPIED,
      CELL_FREE, CELL_FREE, CELL_UNKNOWN, CELL_FREE,
      CELL_OCCUPIED, CELL_OCCUPIED, CELL_FREE, CELL_UNKNOWN,
    ])
  })

  it('数据长度与 width×height 不符：不出图并记 warning', async () => {
    const doc = await buildLocalMapDoc({ shortData: true })
    const frame = buildSceneFrameData(doc, frameAt(doc, Number(BASE)))
    expect(frame.localMap).toBeUndefined()
    expect(frame.warnings.some((text) => text.includes('/local_map'))).toBe(true)
  })

  it('A* 路径已在 odom 系：不做 baseToWorld 变换', async () => {
    const doc = await buildLocalMapDoc()
    const frame = buildSceneFrameData(doc, frameAt(doc, Number(BASE)))
    expect(frame.localMapPathXY).toBeDefined()
    // 车体在 odom (10,0)：/traj_best（base_link 系）会平移 +10，/local_map_path 保持 (1,1)
    expect(frame.localMapPathXY![0]).toBeCloseTo(1, 6)
    expect(frame.localMapPathXY![1]).toBeCloseTo(1, 6)
    expect(frame.localMapPathXY![2]).toBeCloseTo(2.5, 6)
    expect(frame.localMapPathXY![3]).toBeCloseTo(1.5, 6)
  })

  it('旧录像没有 /local_map 与 /local_map_path：保留缺通道显示', async () => {
    const odom: BagChannelInput = {
      topic: '/odom_est',
      schemaName: 'nav_msgs/msg/Odometry',
      schemaText: SCHEMA_ODOMETRY,
      messages: [{ logTimeNs: BASE, message: makeOdometry('odom_est', 0, 0, 10, 0, 0, 0.2, 0) }],
    }
    const doc = await McapDocument.load(await buildMcapBytes([odom]))
    const frame = buildSceneFrameData(doc, frameAt(doc, Number(BASE)))
    expect(frame.localMap).toBeUndefined()
    expect(frame.localMapPathXY).toBeUndefined()
  })
})

describe('normalizeOccupancyCells / asOccupancyGrid 边界', () => {
  it('normalizeOccupancyCells：阈值 65，负数一律未知', () => {
    const cells = normalizeOccupancyCells([0, 64, 65, 100, -1, -128], 3, 2)
    expect([...cells!]).toEqual([
      CELL_FREE, CELL_FREE, CELL_OCCUPIED, CELL_OCCUPIED, CELL_UNKNOWN, CELL_UNKNOWN,
    ])
    expect(normalizeOccupancyCells([0, 1], 3, 2)).toBeUndefined()
    expect(normalizeOccupancyCells([], 0, 0)).toBeUndefined()
  })

  it('asOccupancyGrid：缺 info/data 或尺寸非法时拒绝', () => {
    expect(asOccupancyGrid(undefined)).toBeUndefined()
    expect(asOccupancyGrid({})).toBeUndefined()
    expect(asOccupancyGrid({ info: { resolution: 0.5, width: 2, height: 2, origin: { position: { x: 0, y: 0, z: 0 } } }, data: 'nope' })).toBeUndefined()
    expect(asOccupancyGrid({ info: { resolution: 0, width: 2, height: 2, origin: { position: { x: 0, y: 0, z: 0 } } }, data: [0, 0, 0, 0] })).toBeUndefined()
    const grid = makeOccupancyGrid('odom_est', 0, 0, 0.5, 2, 2, { x: 1, y: -1 }, [0, 0, 0, 0])
    expect(asOccupancyGrid(grid)).toBeDefined()
    expect(occupancyOriginPose(asOccupancyGrid(grid)!)).toEqual({ x: 1, y: -1, yaw: 0 })
  })
})

describe('parseDwaScores：local_map 嵌套组字段', () => {
  const baseJson =
    '{"frame":7,"plan_seq":7,"success":true,"best":0,"samples":12,"evaluated":9,' +
    '"early_terminated":false,"cache_hits":0,"plan_ms":3.1,"window":[0,0.1,-0.1,0.1],' +
    '"cmd":{"v":0.1,"w":0},"candidates":[{"i":0,"v":0.1,"w":0,"h":0.8,"obs":6,"vel":0.29,"cm":0,"bonus":0.3,"tot":7.39}]'

  /** 按 LOCAL_MAP_SCORE_KEYS 单点配置拼嵌套组 JSON（车端改键名时测试无需动）。 */
  function groupJson(entries: [string, unknown][]): string {
    const body = entries.map(([key, value]) => `"${key}":${JSON.stringify(value)}`).join(',')
    return `,"${LOCAL_MAP_SCORE_KEYS.group}":{${body}}`
  }

  it('按 LOCAL_MAP_SCORE_KEYS 配置的组名/子键解析嵌套组', () => {
    const extra = groupJson([
      [LOCAL_MAP_SCORE_KEYS.blk, true],
      [LOCAL_MAP_SCORE_KEYS.navHold, true],
      [LOCAL_MAP_SCORE_KEYS.navReason, 'front blocked'],
      [LOCAL_MAP_SCORE_KEYS.memoryPaused, false],
    ])
    const scores = parseDwaScores(baseJson + extra + '}')
    expect(scores).toBeDefined()
    expect(scores!.local_map).toEqual({
      blk: true,
      nav_hold: true,
      nav_reason: 'front blocked',
      memory_paused: false,
    })
  })

  it('布尔宽容：组内 0/1 数值也按标志位解析（车端早期样例曾用 int）', () => {
    const extra = groupJson([
      [LOCAL_MAP_SCORE_KEYS.blk, 1],
      [LOCAL_MAP_SCORE_KEYS.memoryPaused, 0],
    ])
    const scores = parseDwaScores(baseJson + extra + '}')
    expect(scores!.local_map).toEqual({
      blk: true,
      nav_hold: false,
      nav_reason: '',
      memory_paused: false,
    })
  })

  it('旧录像 JSON 没有该组：local_map 为 undefined', () => {
    const scores = parseDwaScores(baseJson + '}')
    expect(scores).toBeDefined()
    expect(scores!.local_map).toBeUndefined()
  })

  it('组存在但缺子键时缺省给默认值', () => {
    const scores = parseDwaScores(baseJson + groupJson([[LOCAL_MAP_SCORE_KEYS.navHold, true]]) + '}')
    expect(scores!.local_map).toEqual({
      blk: false,
      nav_hold: true,
      nav_reason: '',
      memory_paused: false,
    })
  })

  it('组不是对象时视为没有', () => {
    const scores = parseDwaScores(baseJson + `,"${LOCAL_MAP_SCORE_KEYS.group}":42}`)
    expect(scores!.local_map).toBeUndefined()
  })
})
