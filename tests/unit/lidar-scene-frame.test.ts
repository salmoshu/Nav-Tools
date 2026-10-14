// 场景帧装配测试：验证 TF/里程计两级坐标变换与候选轨迹多消息取回。
import { describe, expect, it } from 'vitest'
import { McapDocument } from '../../src/core/lidar/McapDocument'
import { buildSceneFrameData } from '../../src/core/lidar/SceneFrame'
import { currentFrameScores, type PlannerState } from '../../src/core/lidar/PlannerState'
import type { RosHeader } from '../../src/core/lidar/LidarGeometry'
import type { CurrentFrame, CurrentMessage } from '../../src/core/lidar/types'
import {
  SCHEMA_LASER_SCAN,
  SCHEMA_ODOMETRY,
  SCHEMA_PATH,
  SCHEMA_POINT_CLOUD2,
  SCHEMA_POSE_STAMPED,
  SCHEMA_STRING,
  SCHEMA_TF_MESSAGE,
  buildMcapBytes,
  makeLaserScan,
  makeOdometry,
  makePath,
  makePointCloud2,
  makeTf,
  type BagChannelInput,
  header,
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

// The original helper schemas intentionally remain legacy fixtures.
function standardMessage<T extends { stamp: RosHeader }>(message: T) {
  const { stamp, ...fields } = message
  return { header: stamp, ...fields }
}

function plannerState(frame: number, source = 'tracking_dwa', observation = true): PlannerState {
  return {
    frame, source, enabled: true, success: true, has_observation: observation,
    has_pose: true, has_scan_pose: true, scan_capture_valid: true,
    scan_capture_ns: '10000000000000003', scan_pose_ns: '10000000000000001',
    pose_ns: '10000000000000001', processing_start_ns: '1100000000',
    command_ns: '1100000000', command_done_ns: '1100000000', cmd: { v: 0.3, w: 0 },
    dispatch: { sink_present: true, attempted: true, accepted: true, state: 'accepted' },
    local_map: { active: false, blk: false, nav_hold: false, nav_reason: '', memory_paused: false },
    wheel: { known: true, present: true, fresh: true, sequence: '1', age_ms: 2 },
    target: { known: true, present: true, fresh: true, sequence: '1', age_ms: 3 },
    bypass: {
      attempted: false, search_ns: null, found: false, complete: false, reason: 'not_attempted',
      start_unknown: false, start_occupied: false, start_clearance_blocked: false,
      goal_outside_window: false, goal_unknown: false, goal_clearance_blocked: false,
      terminal_candidates: 0, terminal_unknown: 0, terminal_clearance_blocked: 0,
      terminal_disconnected: 0, terminal_footprint_blocked: 0, reachable_cells: 0,
    },
  }
}

function dynamicTf(nanosec: number, x: number) {
  return {
    transforms: [
      {
        header: header('odom_est', 10_000_000, nanosec), child_frame_id: 'base_link',
        transform: { translation: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      },
      standardMessage(makeTf(0.75, 10_000_000, nanosec).transforms[0]),
    ],
  }
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

describe('recorded geometry time and current planner precedence', () => {
  it('uses late capture association and exact nanosecond TF, keeping cached geometry anchored across a pose reset', async () => {
    const planEvent = BASE + 100_000_000n
    const resetEvent = BASE + 200_000_000n
    const state = plannerState(1)
    const resetState = { ...plannerState(2), pose_ns: '10000000000000002' }
    const path = makePath('base_link', 10_000_000, 1, [[0, 0], [1, 0]])
    const channels: BagChannelInput[] = [
      {
        topic: '/scan_raw', schemaName: 'sensor_msgs/msg/LaserScan',
        schemaText: SCHEMA_LASER_SCAN.replaceAll('std_msgs/Header stamp', 'std_msgs/Header header'),
        messages: [{ logTimeNs: BASE, message: standardMessage(makeLaserScan('laser', 10_000_000, 3, [3], 0, 0)) }],
      },
      {
        topic: '/tf', schemaName: 'tf2_msgs/msg/TFMessage',
        schemaText: SCHEMA_TF_MESSAGE.replaceAll('std_msgs/Header stamp', 'std_msgs/Header header'),
        messages: [
          { logTimeNs: planEvent, message: dynamicTf(1, 10) },
          { logTimeNs: resetEvent, message: dynamicTf(2, -20) },
        ],
      },
      {
        topic: '/odom_est', schemaName: 'nav_msgs/msg/Odometry',
        schemaText: SCHEMA_ODOMETRY.replaceAll('std_msgs/Header stamp', 'std_msgs/Header header'),
        messages: [
          { logTimeNs: planEvent, message: standardMessage(makeOdometry('odom_est', 10_000_000, 1, 10, 0, 0, 0.3, 0)) },
          { logTimeNs: resetEvent, message: standardMessage(makeOdometry('odom_est', 10_000_000, 2, -20, 0, 0, 0.3, 0)) },
        ],
      },
      {
        topic: '/obstacles_planned', schemaName: 'sensor_msgs/msg/PointCloud2',
        schemaText: SCHEMA_POINT_CLOUD2.replaceAll('std_msgs/Header stamp', 'std_msgs/Header header'),
        messages: [{ logTimeNs: planEvent, message: standardMessage(makePointCloud2('base_link', 10_000_000, 1, [[1, 0, 0]])) }],
      },
      {
        topic: '/goal', schemaName: 'geometry_msgs/msg/PoseStamped',
        schemaText: SCHEMA_POSE_STAMPED.replaceAll('std_msgs/Header stamp', 'std_msgs/Header header'),
        messages: [{ logTimeNs: planEvent, message: { header: header('base_link', 10_000_000, 1),
          pose: path.poses[1].pose } }],
      },
      {
        topic: '/traj_best', schemaName: 'nav_msgs/msg/Path',
        schemaText: SCHEMA_PATH.replaceAll('std_msgs/Header stamp', 'std_msgs/Header header'),
        messages: [{ logTimeNs: planEvent, message: { ...standardMessage(path), poses: path.poses.map(standardMessage) } }],
      },
      {
        topic: '/planner_state', schemaName: 'std_msgs/msg/String', schemaText: SCHEMA_STRING,
        messages: [
          { logTimeNs: planEvent, message: { data: JSON.stringify(state) } },
          { logTimeNs: resetEvent, message: { data: JSON.stringify(resetState) } },
        ],
      },
    ]
    const doc = await McapDocument.load(await buildMcapBytes(channels))
    const capture = buildSceneFrameData(doc, frameAt(doc, Number(BASE)))
    // TF and its capture association are not event-available yet, but are recorded offline.
    expect(capture.scanRawXY![0]).toBeCloseTo(13.75, 5)
    const initial = buildSceneFrameData(doc, frameAt(doc, Number(planEvent)))
    expect(initial.bestPathXY![2]).toBeCloseTo(11, 5)
    const moved = buildSceneFrameData(doc, frameAt(doc, Number(resetEvent)))
    expect(moved.robot.odomX).toBe(-20)
    expect(moved.scanRawXY![0]).toBeCloseTo(13.75, 5)
    expect(moved.obstaclesXY![0]).toBeCloseTo(11, 5)
    expect(moved.goalXY!.x).toBeCloseTo(11, 5)
    expect(moved.bestPathXY).toBeUndefined()
  })

  it('hides a missing exact sample between two reset poses instead of interpolating or using latest odometry', async () => {
    const doc = await McapDocument.load(await buildMcapBytes([
      {
        topic: '/tf', schemaName: 'tf2_msgs/msg/TFMessage',
        schemaText: SCHEMA_TF_MESSAGE.replaceAll('std_msgs/Header stamp', 'std_msgs/Header header'),
        messages: [
          { logTimeNs: BASE, message: dynamicTf(0, 10) },
          { logTimeNs: BASE + 100_000_000n, message: dynamicTf(2, -20) },
        ],
      },
      {
        topic: '/obstacles_planned', schemaName: 'sensor_msgs/msg/PointCloud2',
        schemaText: SCHEMA_POINT_CLOUD2.replaceAll('std_msgs/Header stamp', 'std_msgs/Header header'),
        messages: [{ logTimeNs: BASE, message: standardMessage(makePointCloud2('base_link', 10_000_000, 1, [[1, 0, 0]])) }],
      },
    ]))
    const scene = buildSceneFrameData(doc, frameAt(doc, Number(BASE + 100_000_000n)))
    expect(scene.obstaclesXY).toBeUndefined()
  })

  it.each([
    { source: 'navigation_hold', hold: true, w: 0 },
    { source: 'navigation_survey', hold: true, w: 0.2 },
    { source: 'scan_pose_unavailable', hold: false, w: 0 },
  ])('hides older successful scores and paths on $source even when the current state reports success', async ({ source, hold, w }) => {
    const state = plannerState(2, source, false)
    state.cmd = { v: 0, w }
    state.local_map.nav_hold = hold
    state.local_map.nav_reason = hold ? 'terminal_unavailable' : ''
    const scores = {
      frame: 1, plan_seq: 1, success: true, best: 0, samples: 1, evaluated: 1,
      early_terminated: false, cache_hits: 0, plan_ms: 1, window: [0, 1, -1, 1],
      cmd: { v: 0.3, w: 0 }, candidates: [{ i: 0, v: 0.3, w: 0, tot: 1 }],
    }
    const channels: BagChannelInput[] = ['/traj_best', '/traj_candidates'].map((topic) => ({
      topic, schemaName: 'nav_msgs/msg/Path', schemaText: SCHEMA_PATH,
      messages: [{ logTimeNs: BASE, message: makePath('base_link', 0, 0, [[0, 0], [1, 0]]) }],
    }))
    channels.push(
      { topic: '/dwa_scores', schemaName: 'std_msgs/msg/String', schemaText: SCHEMA_STRING,
        messages: [{ logTimeNs: BASE, message: { data: JSON.stringify(scores) } }] },
      { topic: '/planner_state', schemaName: 'std_msgs/msg/String', schemaText: SCHEMA_STRING,
        messages: [
          { logTimeNs: BASE, message: { data: JSON.stringify(plannerState(1)) } },
          { logTimeNs: BASE + 100_000_000n, message: { data: JSON.stringify(state) } },
        ] },
    )
    const doc = await McapDocument.load(await buildMcapBytes(channels))
    expect(currentFrameScores(frameAt(doc, Number(BASE)), true)?.frame).toBe(1)
    const current = frameAt(doc, Number(BASE + 100_000_000n))
    expect(currentFrameScores(current, true)).toBeUndefined()
    const scene = buildSceneFrameData(doc, current)
    expect(scene.bestPathXY).toBeUndefined()
    expect(scene.candidatePathsXY).toHaveLength(0)
  })

  it.each([
    { captureValid: false, scanPose: true },
    { captureValid: true, scanPose: false },
  ])('does not upgrade invalid capture/scan pose to a coincident plan transform ($captureValid/$scanPose)', async ({ captureValid, scanPose }) => {
    const state = {
      ...plannerState(1), scan_capture_valid: captureValid, has_scan_pose: scanPose,
      scan_capture_ns: captureValid ? '10000000000000001' : null,
      processing_start_ns: '10000000000000001',
    }
    const doc = await McapDocument.load(await buildMcapBytes([
      {
        topic: '/scan_raw', schemaName: 'sensor_msgs/msg/LaserScan',
        schemaText: SCHEMA_LASER_SCAN.replaceAll('std_msgs/Header stamp', 'std_msgs/Header header'),
        messages: [{ logTimeNs: BASE, message: standardMessage(makeLaserScan('laser', 10_000_000, 1, [3], 0, 0)) }],
      },
      {
        topic: '/tf', schemaName: 'tf2_msgs/msg/TFMessage',
        schemaText: SCHEMA_TF_MESSAGE.replaceAll('std_msgs/Header stamp', 'std_msgs/Header header'),
        messages: [{ logTimeNs: BASE + 100_000_000n, message: dynamicTf(1, 10) }],
      },
      {
        topic: '/planner_state', schemaName: 'std_msgs/msg/String', schemaText: SCHEMA_STRING,
        messages: [{ logTimeNs: BASE + 100_000_000n, message: { data: JSON.stringify(state) } }],
      },
    ]))
    const capture = buildSceneFrameData(doc, frameAt(doc, Number(BASE)))
    expect(capture.scanRawXY).toBeUndefined()
  })
})
