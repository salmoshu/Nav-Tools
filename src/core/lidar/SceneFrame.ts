// 场景帧装配：播放头按事件时间取消息，几何按各自 Header 采样时间定锚。
// 固定链：odom_est → base_link（后轮轴心）→ laser；map/path 已在 odom_est。
// 旧录像缺动态 TF 时保留历史显示，但明确警告其时序不可作为真实世界锚点。
import type { CurrentFrame, CurrentMessage, LocalMapView, SceneFrameData } from './types'
import type { McapDocument } from './McapDocument'
import { RecordedTransforms } from './RecordedTransforms'
import { currentPlanEventNs } from './PlannerState'
import {
  asLaserScan,
  asOccupancyGrid,
  asOdometry,
  asPath,
  asPointCloud2,
  asPolygonStamped,
  asPoseStamped,
  asTfMessage,
  laserScanToXY,
  messageHeader,
  normalizeOccupancyCells,
  occupancyOriginPose,
  odometryToPose,
  pathToXY,
  pointCloud2ToXYZ,
  polygonToXY,
  transformXY,
} from './LidarGeometry'

/** 板端固定通道名（trace_schemas.cpp）。 */
export const LIDAR_TOPICS = {
  scanRaw: '/scan_raw',
  scanFiltered: '/scan_filtered',
  obstacles: '/obstacles_planned',
  tf: '/tf',
  footprint: '/footprint',
  footprintMargin: '/footprint_margin',
  trajBest: '/traj_best',
  trajCandidates: '/traj_candidates',
  goal: '/goal',
  odom: '/odom_est',
  cmd: '/cmd_raw',
  scores: '/dwa_scores',
  plannerState: '/planner_state',
  /** 绕障在役时段的局部占据栅格（约 3Hz 节流；旧录像没有） */
  localMap: '/local_map',
  /** local_map 当前 A* 路径（odom 系；旧录像没有） */
  localMapPath: '/local_map_path',
} as const

export interface BuildSceneOptions {
  /** 里程计轨迹最多保留多少个点（降采样），默认 4000 */
  trailMaxPoints?: number
  /** 加载期预提取的里程计序列（buildPlotSeries 产物）；提供时轨迹直接切片，不再逐条重解码 */
  trailSeries?: { t: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number> }
}

export function buildSceneFrameData(
  doc: McapDocument,
  frame: CurrentFrame,
  options: BuildSceneOptions = {},
): SceneFrameData {
  const trailMaxPoints = options.trailMaxPoints ?? 4000
  const warnings: string[] = []
  const transforms = RecordedTransforms.forDocument(doc)
  const hasPlannerState = doc.topicInfo(LIDAR_TOPICS.plannerState) !== undefined
  const legacyTiming = !transforms.hasDynamicTf && !hasPlannerState
  if (legacyTiming) warnings.push('旧录像缺少动态 TF：历史回退使用当前里程计，缓存几何的采样世界锚点不可靠')
  if (!hasPlannerState) warnings.push('缺少 /planner_state：逐帧停止原因、输入新鲜度与执行状态不可确认')

  // ——— 车体位姿与雷达外参 ———
  const odomEntry = frame.entries.get(LIDAR_TOPICS.odom)
  let odomX: number | undefined
  let odomY: number | undefined
  let odomYaw: number | undefined
  if (odomEntry) {
    const odom = asOdometry(odomEntry.message)
    if (odom) {
      const pose = odometryToPose(odom)
      odomX = pose.x
      odomY = pose.y
      odomYaw = pose.yaw
    } else {
      warnings.push('/odom_est 消息结构异常')
    }
  }
  const hasOdom = odomX !== undefined && odomY !== undefined && odomYaw !== undefined

  let laserOffsetX = 0
  let laserOffsetY = 0
  let laserYaw = 0
  const tfEntry = frame.entries.get(LIDAR_TOPICS.tf)
  if (tfEntry) {
    const tf = asTfMessage(tfEntry.message)
    const transform = tf?.transforms?.find((entry) => entry.child_frame_id === 'laser')
    if (transform) {
      laserOffsetX = transform.transform.translation.x
      laserOffsetY = transform.transform.translation.y
      const q = transform.transform.rotation
      laserYaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
    }
  }

  const baseToWorld = (xy: Float32Array): Float32Array =>
    hasOdom ? transformXY(xy, odomX!, odomY!, odomYaw!) : xy
  const toWorld = (xy: Float32Array, entry: CurrentMessage, legacyFrame: string): Float32Array | undefined => {
    const exact = transforms.toWorld(xy, entry.message, entry.logTimeNs)
    if (exact) return exact
    if (!legacyTiming) {
      warnings.push(`${entry.topic} 缺少对应 Header 采样时间的精确 TF/扫描位姿关联，几何已隐藏`)
      return undefined
    }
    const frameId = messageHeader(entry.message)?.frame_id ?? legacyFrame
    if (frameId === 'odom_est') return xy
    if (frameId === 'base_link') return baseToWorld(xy)
    if (frameId === 'laser') return baseToWorld(transformXY(xy, laserOffsetX, laserOffsetY, laserYaw))
    warnings.push(`${entry.topic} 未知坐标系 ${frameId}，几何已隐藏`)
    return undefined
  }

  // ——— 雷达点云两层 ———
  let scanRawXY: Float32Array | undefined
  let scanRawIntensity: Float32Array | undefined
  let scanFilteredXY: Float32Array | undefined
  const scanRawEntry = frame.entries.get(LIDAR_TOPICS.scanRaw)
  if (scanRawEntry) {
    const scan = asLaserScan(scanRawEntry.message)
    if (scan) {
      const { xy, intensity } = laserScanToXY(scan)
      scanRawXY = toWorld(xy, scanRawEntry, 'laser')
      scanRawIntensity = intensity
    } else {
      warnings.push('/scan_raw 消息结构异常')
    }
  }
  const scanFilteredEntry = frame.entries.get(LIDAR_TOPICS.scanFiltered)
  if (scanFilteredEntry) {
    const scan = asLaserScan(scanFilteredEntry.message)
    if (scan) {
      scanFilteredXY = toWorld(laserScanToXY(scan).xy, scanFilteredEntry, 'laser')
    } else {
      warnings.push('/scan_filtered 消息结构异常')
    }
  }

  // ——— 规划障碍点（base_link 系 PointCloud2） ———
  let obstaclesXY: Float32Array | undefined
  const obstaclesEntry = frame.entries.get(LIDAR_TOPICS.obstacles)
  if (obstaclesEntry) {
    const cloud = asPointCloud2(obstaclesEntry.message)
    if (cloud) {
      const xyz = pointCloud2ToXYZ(cloud)
      const xy = new Float32Array((xyz.length / 3) * 2)
      for (let i = 0; i < xyz.length / 3; i++) {
        xy[i * 2] = xyz[i * 3]
        xy[i * 2 + 1] = xyz[i * 3 + 1]
      }
      obstaclesXY = toWorld(xy, obstaclesEntry, 'base_link')
    } else {
      warnings.push('/obstacles_planned 消息结构异常')
    }
  }

  // ——— 轨迹（base_link 系 Path） ———
  const planEvent = currentPlanEventNs(frame)
  let bestPathXY: Float32Array | undefined
  const bestEntry = frame.entries.get(LIDAR_TOPICS.trajBest)
  if (bestEntry && (!hasPlannerState || bestEntry.logTimeNs === planEvent)) {
    const path = asPath(bestEntry.message)
    if (path) bestPathXY = toWorld(pathToXY(path), bestEntry, 'base_link')
  }
  const candidatePathsXY: Float32Array[] = []
  for (const entry of doc.decodeAllAtOrBefore(LIDAR_TOPICS.trajCandidates, frame.timeNs)) {
    if (hasPlannerState && entry.logTimeNs !== planEvent) continue
    const path = asPath(entry.message)
    if (path) {
      const world = toWorld(pathToXY(path), entry, 'base_link')
      if (world) candidatePathsXY.push(world)
    }
  }

  // ——— 轮廓与目标 ———
  let footprintXY: Float32Array | undefined
  const footprintEntry = frame.entries.get(LIDAR_TOPICS.footprint)
  if (footprintEntry) {
    const polygon = asPolygonStamped(footprintEntry.message)
    if (polygon) footprintXY = baseToWorld(polygonToXY(polygon))
  }
  let footprintMarginXY: Float32Array | undefined
  const marginEntry = frame.entries.get(LIDAR_TOPICS.footprintMargin)
  if (marginEntry) {
    const polygon = asPolygonStamped(marginEntry.message)
    if (polygon) footprintMarginXY = baseToWorld(polygonToXY(polygon))
  }
  let goalXY: { x: number; y: number } | undefined
  const goalEntry = frame.entries.get(LIDAR_TOPICS.goal)
  if (goalEntry) {
    const goal = asPoseStamped(goalEntry.message)
    if (goal) {
      const gx = goal.pose.position.x
      const gy = goal.pose.position.y
      const world = toWorld(Float32Array.of(gx, gy), goalEntry, 'base_link')
      if (world) goalXY = { x: world[0], y: world[1] }
    }
  }

  // ——— local_map 占据栅格与 A* 路径（odom 系数据，按 origin 摆放，
  //      不走 laser→base_link→odom 变换链；旧录像没有这两个 channel） ———
  let localMap: LocalMapView | undefined
  const localMapEntry = frame.entries.get(LIDAR_TOPICS.localMap)
  if (localMapEntry) {
    const grid = asOccupancyGrid(localMapEntry.message)
    if (grid) {
      const cells = normalizeOccupancyCells(grid.data, grid.info.width, grid.info.height)
      if (cells) {
        const origin = occupancyOriginPose(grid)
        localMap = {
          resolution: grid.info.resolution,
          width: Math.floor(grid.info.width),
          height: Math.floor(grid.info.height),
          originX: origin.x,
          originY: origin.y,
          originYaw: origin.yaw,
          cells,
        }
      } else {
        warnings.push('/local_map 数据长度与 width×height 不符')
      }
    } else {
      warnings.push('/local_map 消息结构异常')
    }
  }
  let localMapPathXY: Float32Array | undefined
  const localMapPathEntry = frame.entries.get(LIDAR_TOPICS.localMapPath)
  if (localMapPathEntry) {
    const path = asPath(localMapPathEntry.message)
    if (path) localMapPathXY = pathToXY(path)
  }
  // A* path is throttled and world-fixed. Keep it visible, but do not imply it is a current plan.
  const stateEvent = frame.entries.get(LIDAR_TOPICS.plannerState)?.logTimeNs
  for (const topic of [LIDAR_TOPICS.localMap, LIDAR_TOPICS.localMapPath]) {
    const entry = frame.entries.get(topic)
    if (entry && (stateEvent === undefined || entry.logTimeNs !== stateEvent)) {
      warnings.push(`${topic} 缓存数据：事件年龄 ${Math.max(0, (frame.timeNs - entry.logTimeNs) / 1e6).toFixed(1)} ms`)
    }
  }
  if (bestEntry && hasPlannerState && bestEntry.logTimeNs !== planEvent) {
    warnings.push('旧帧 DWA 轨迹已隐藏；当前 /planner_state 未提供同帧观测')
  } else if (bestEntry && !hasPlannerState && bestEntry.logTimeNs < frame.timeNs) {
    warnings.push(`/traj_best 历史数据：事件年龄 ${((frame.timeNs - bestEntry.logTimeNs) / 1e6).toFixed(1)} ms`)
  }

  // ——— 里程计轨迹（估计位姿的历史） ———
  let odomTrailXY: Float32Array | undefined
  if (odomEntry) {
    const startNs = doc.startNs
    odomTrailXY = options.trailSeries && startNs !== undefined
      ? trailFromSeries(options.trailSeries, frame.timeNs - startNs, trailMaxPoints)
      : buildTrail(doc, odomEntry.index, trailMaxPoints)
  }

  return {
    timeNs: frame.timeNs,
    robot: {
      odomX,
      odomY,
      odomYaw,
      laserOffsetX,
      laserOffsetY,
      hasOdom,
    },
    scanRawXY,
    scanRawIntensity,
    scanFilteredXY,
    obstaclesXY,
    bestPathXY,
    candidatePathsXY,
    footprintXY,
    footprintMarginXY,
    goalXY,
    odomTrailXY,
    localMap,
    localMapPathXY,
    warnings,
  }
}

/** 里程计历史轨迹：0..currentIndex 降采样取点（odom_est 系）。 */
function buildTrail(doc: McapDocument, currentIndex: number, maxPoints: number): Float32Array {
  const total = Math.max(0, Math.min(currentIndex + 1, doc.topicInfo(LIDAR_TOPICS.odom)?.messageCount ?? 0))
  if (total === 0) return new Float32Array(0)
  const stride = Math.max(1, Math.ceil(total / Math.max(1, maxPoints)))
  const points: number[] = []
  for (let index = 0; index < total; index += stride) {
    const message = doc.decodeByIndex(LIDAR_TOPICS.odom, index)
    const odom = message ? asOdometry(message) : undefined
    if (!odom) continue
    const pose = odometryToPose(odom)
    points.push(pose.x, pose.y)
  }
  return Float32Array.from(points)
}

/** 预提取序列切片版轨迹：播放期零解码（series.t 以 doc.startNs 为基准的相对 ns）。 */
function trailFromSeries(
  series: { t: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number> },
  relTimeNs: number,
  maxPoints: number,
): Float32Array {
  let lo = 0
  let hi = series.t.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (series.t[mid] <= relTimeNs) lo = mid + 1
    else hi = mid
  }
  const total = lo
  if (total === 0) return new Float32Array(0)
  const stride = Math.max(1, Math.ceil(total / Math.max(1, maxPoints)))
  const points = new Float32Array(Math.ceil(total / stride) * 2)
  let p = 0
  for (let index = 0; index < total; index += stride) {
    points[p++] = series.x[index]
    points[p++] = series.y[index]
  }
  return points.subarray(0, p) as Float32Array
}
