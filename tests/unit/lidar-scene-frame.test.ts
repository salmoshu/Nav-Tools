// 场景帧装配测试：验证 TF/里程计两级坐标变换与候选轨迹多消息取回。
import { describe, expect, it } from 'vitest'
import { McapDocument } from '../../src/core/lidar/McapDocument'
import { buildSceneFrameData } from '../../src/core/lidar/SceneFrame'
import type { CurrentFrame, CurrentMessage } from '../../src/core/lidar/types'
import {
  SCHEMA_LASER_SCAN,
  SCHEMA_ODOMETRY,
  SCHEMA_PATH,
  SCHEMA_POINT_CLOUD2,
  SCHEMA_TF_MESSAGE,
  buildMcapBytes,
  makeLaserScan,
  makeOdometry,
  makePath,
  makePointCloud2,
  makeTf,
  type BagChannelInput,
} from './helpers/lidarTestBag'

const BASE = 1_000_000_000n

/** 车体在 odom (10,0) 朝 +x；雷达前移 0.75；正前 3m 有一堵墙。 */
async function buildSceneDoc(): Promise<McapDocument> {
  const scan: BagChannelInput = {
    topic: '/scan_raw',
    schemaName: 'sensor_msgs/msg/LaserScan',
    schemaText: SCHEMA_LASER_SCAN,
    // 雷达系：i=0 正前 3m、i=2 正左 2m，其余为无效值 999（超量程剔除）
    messages: [
      {
        logTimeNs: BASE,
        message: makeLaserScan('laser', 0, 0, [3, 999, 2, 999, 999, 999, 999, 999], 0, Math.PI / 4),
      },
    ],
  }
  const tf: BagChannelInput = {
    topic: '/tf',
    schemaName: 'tf2_msgs/msg/TFMessage',
    schemaText: SCHEMA_TF_MESSAGE,
    messages: [{ logTimeNs: BASE, message: makeTf(0.75, 0, 0) }],
  }
  const odom: BagChannelInput = {
    topic: '/odom_est',
    schemaName: 'nav_msgs/msg/Odometry',
    schemaText: SCHEMA_ODOMETRY,
    messages: [
      { logTimeNs: BASE, message: makeOdometry('odom_est', 0, 0, 10, 0, 0, 0.2, 0) },
      { logTimeNs: BASE + 500_000_000n, message: makeOdometry('odom_est', 0, 5e8, 10.1, 0, 0, 0.2, 0) },
    ],
  }
  const obstacles: BagChannelInput = {
    topic: '/obstacles_planned',
    schemaName: 'sensor_msgs/msg/PointCloud2',
    schemaText: SCHEMA_POINT_CLOUD2,
    messages: [
      { logTimeNs: BASE, message: makePointCloud2('base_link', 0, 0, [[1, 0, 0]]) },
    ],
  }
  const candidates: BagChannelInput = {
    topic: '/traj_candidates',
    schemaName: 'nav_msgs/msg/Path',
    schemaText: SCHEMA_PATH,
    messages: [
      { logTimeNs: BASE, message: makePath('base_link', 0, 0, [[0, 0], [0.5, 0]]) },
      { logTimeNs: BASE, message: makePath('base_link', 0, 0, [[0, 0], [0, 0.5]]) },
    ],
  }
  const bytes = await buildMcapBytes([scan, tf, odom, obstacles, candidates])
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

describe('buildSceneFrameData', () => {
  it('扫描点经 laser→base_link→odom 两级变换', async () => {
    const doc = await buildSceneDoc()
    const frame = buildSceneFrameData(doc, frameAt(doc, Number(BASE)))
    // 雷达系正前 3m 点：base_link 系 (3.75, 0) → odom 系 (13.75, 0)
    expect(frame.scanRawXY).toBeDefined()
    expect(frame.scanRawXY![0]).toBeCloseTo(13.75, 5)
    expect(frame.scanRawXY![1]).toBeCloseTo(0, 5)
    // 雷达系正左 2m 点：base_link 系 (0.75, 2) → odom (10.75, 2)
    expect(frame.scanRawXY![2]).toBeCloseTo(10.75, 5)
    expect(frame.scanRawXY![3]).toBeCloseTo(2, 5)
    // 有效点只剩两个（999 超量程剔除）
    expect(frame.scanRawXY!.length).toBe(4)
  })

  it('车体位姿取自 odom_est，轨迹候选变换到世界系', async () => {
    const doc = await buildSceneDoc()
    const frame = buildSceneFrameData(doc, frameAt(doc, Number(BASE)))
    expect(frame.robot.hasOdom).toBe(true)
    expect(frame.robot.odomX).toBe(10)
    expect(frame.robot.laserOffsetX).toBe(0.75)
    // base_link 系障碍点 (1,0) → odom (11,0)
    expect(frame.obstaclesXY![0]).toBeCloseTo(11, 5)
    // 两条同戳候选 → 两条世界系轨迹：第一条起点 (10,0)，末点 (10.5,0)
    expect(frame.candidatePathsXY).toHaveLength(2)
    expect(frame.candidatePathsXY[0][0]).toBeCloseTo(10, 5)
    expect(frame.candidatePathsXY[0][2]).toBeCloseTo(10.5, 5)
    // 第二条末点 (10, 0.5)
    expect(frame.candidatePathsXY[1][3]).toBeCloseTo(0.5, 5)
  })

  it('里程计轨迹随播放头增长', async () => {
    const doc = await buildSceneDoc()
    const early = buildSceneFrameData(doc, frameAt(doc, Number(BASE)))
    expect(early.odomTrailXY!.length).toBe(2) // 一个点
    const late = buildSceneFrameData(doc, frameAt(doc, Number(BASE) + 500_000_000))
    expect(late.odomTrailXY!.length).toBe(4) // 两个点
    expect(late.odomTrailXY![2]).toBeCloseTo(10.1, 5)
  })
})
