// 场景帧装配：把“播放头之前最近的消息集合”变成渲染端可直接绘制的几何数组。
// 坐标约定（ADR-035）：base_link = 后轮轴心；/tf 给出 laser 相对 base_link 的外参；
// /odom_est 给出 base_link 在估计里程计系下的位姿（会漂移，仅用于显示）。
// 输出几何一律已在“世界系”（有里程计=odom_est，无里程计=base_link）。
import type { CurrentFrame, SceneFrameData } from './types'
import type { McapDocument } from './McapDocument'
import {
  asLaserScan,
  asOdometry,
  asPath,
  asPointCloud2,
  asPolygonStamped,
  asPoseStamped,
  asTfMessage,
  laserScanToXY,
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

  const toWorld = (xy: Float32Array): Float32Array => {
    const inBase = transformXY(xy, laserOffsetX, laserOffsetY, laserYaw)
    return hasOdom ? transformXY(inBase, odomX!, odomY!, odomYaw!) : inBase
  }
  const baseToWorld = (xy: Float32Array): Float32Array =>
    hasOdom ? transformXY(xy, odomX!, odomY!, odomYaw!) : xy

  // ——— 雷达点云两层 ———
  let scanRawXY: Float32Array | undefined
  let scanRawIntensity: Float32Array | undefined
  let scanFilteredXY: Float32Array | undefined
  const scanRawEntry = frame.entries.get(LIDAR_TOPICS.scanRaw)
  if (scanRawEntry) {
    const scan = asLaserScan(scanRawEntry.message)
    if (scan) {
      const { xy, intensity } = laserScanToXY(scan)
      scanRawXY = toWorld(xy)
      scanRawIntensity = intensity
    } else {
      warnings.push('/scan_raw 消息结构异常')
    }
  }
  const scanFilteredEntry = frame.entries.get(LIDAR_TOPICS.scanFiltered)
  if (scanFilteredEntry) {
    const scan = asLaserScan(scanFilteredEntry.message)
    if (scan) {
      scanFilteredXY = toWorld(laserScanToXY(scan).xy)
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
      obstaclesXY = baseToWorld(xy)
    } else {
      warnings.push('/obstacles_planned 消息结构异常')
    }
  }

  // ——— 轨迹（base_link 系 Path） ———
  let bestPathXY: Float32Array | undefined
  const bestEntry = frame.entries.get(LIDAR_TOPICS.trajBest)
  if (bestEntry) {
    const path = asPath(bestEntry.message)
    if (path) bestPathXY = baseToWorld(pathToXY(path))
  }
  const candidatePathsXY: Float32Array[] = []
  for (const entry of doc.decodeAllAtOrBefore(LIDAR_TOPICS.trajCandidates, frame.timeNs)) {
    const path = asPath(entry.message)
    if (path) candidatePathsXY.push(baseToWorld(pathToXY(path)))
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
      const world = baseToWorld(Float32Array.of(gx, gy))
      goalXY = { x: world[0], y: world[1] }
    }
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
