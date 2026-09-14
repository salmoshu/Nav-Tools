// 对解码后的 ROS 消息做几何/字段提取。
// 消息是 @foxglove/rosmsg2-serialization 按文件内 schema 产出的普通对象/TypedArray，
// 这里只做结构守卫与数值提取，绝不改数值本身。
// 注意板上 schema：Header 字段名是 stamp（内层才是 Time），故 stamp.stamp 为时间。

export interface RosTime {
  sec: number
  nanosec: number
}

export interface RosHeader {
  /** 板上 schema 中 Header 的内嵌 Time 字段恰好也叫 stamp */
  stamp?: RosTime
  frame_id?: string
}

export interface LaserScanMessage {
  stamp: RosHeader
  angle_min: number
  angle_max: number
  angle_increment: number
  time_increment: number
  scan_time: number
  range_min: number
  range_max: number
  ranges: ArrayLike<number>
  intensities?: ArrayLike<number>
}

export interface PointCloud2Message {
  stamp: RosHeader
  height: number
  width: number
  fields: { name: string; offset: number; datatype: number; count: number }[]
  is_bigendian: boolean
  point_step: number
  row_step: number
  data: ArrayLike<number>
  is_dense: boolean
}

export interface PolygonStampedMessage {
  stamp: RosHeader
  polygon: { points: ArrayLike<{ x: number; y: number; z: number }> }
}

export interface PathMessage {
  stamp: RosHeader
  poses: ArrayLike<{ pose: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } } }>
}

export interface PoseStampedMessage {
  stamp: RosHeader
  pose: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } }
}

export interface OdometryMessage {
  stamp: RosHeader
  child_frame_id: string
  pose: {
    pose: {
      position: { x: number; y: number; z: number }
      orientation: { x: number; y: number; z: number; w: number }
    }
  }
  twist: { twist: { linear: { x: number; y: number; z: number }; angular: { x: number; y: number; z: number } } }
}

export interface TwistMessage {
  linear: { x: number; y: number; z: number }
  angular: { x: number; y: number; z: number }
}

export interface TfMessage {
  transforms: {
    stamp: RosHeader
    child_frame_id: string
    transform: {
      translation: { x: number; y: number; z: number }
      rotation: { x: number; y: number; z: number; w: number }
    }
  }[]
}

// ——— 结构守卫 ———

export function asLaserScan(value: unknown): LaserScanMessage | undefined {
  if (!isObject(value) || !isArrayLike(value.ranges) || typeof value.angle_min !== 'number') {
    return undefined
  }
  return value as unknown as LaserScanMessage
}

export function asPointCloud2(value: unknown): PointCloud2Message | undefined {
  if (!isObject(value) || !isArrayLike(value.data) || typeof value.point_step !== 'number') {
    return undefined
  }
  return value as unknown as PointCloud2Message
}

export function asPolygonStamped(value: unknown): PolygonStampedMessage | undefined {
  if (!isObject(value)) return undefined
  const polygon = (value as { polygon?: { points?: unknown } }).polygon
  if (!isObject(polygon) || !isArrayLike(polygon.points)) return undefined
  return value as unknown as PolygonStampedMessage
}

export function asPath(value: unknown): PathMessage | undefined {
  if (!isObject(value)) return undefined
  if (!isArrayLike((value as { poses?: unknown }).poses)) return undefined
  return value as unknown as PathMessage
}

export function asPoseStamped(value: unknown): PoseStampedMessage | undefined {
  if (!isObject(value)) return undefined
  const pose = (value as { pose?: unknown }).pose
  if (!isObject(pose) || !isObject(pose.position)) return undefined
  return value as unknown as PoseStampedMessage
}

export function asOdometry(value: unknown): OdometryMessage | undefined {
  if (!isObject(value)) return undefined
  const pose = (value as { pose?: { pose?: unknown } }).pose
  if (!isObject(pose) || !isObject(pose.pose)) return undefined
  return value as unknown as OdometryMessage
}

export function asTwist(value: unknown): TwistMessage | undefined {
  if (!isObject(value)) return undefined
  const twist = value as { linear?: unknown; angular?: unknown }
  if (!isObject(twist.linear) || !isObject(twist.angular)) return undefined
  return value as unknown as TwistMessage
}

export function asTfMessage(value: unknown): TfMessage | undefined {
  if (!isObject(value)) return undefined
  if (!isArrayLike((value as { transforms?: unknown }).transforms)) return undefined
  return value as unknown as TfMessage
}

// ——— 提取函数（输出平铺数组，渲染端直接可吃） ———

/**
 * LaserScan → 雷达系下 xy 平铺数组。无效点（非有限值或超出量程）剔除。
 * 同时返回强度数组（与有效点一一对应；消息无强度字段时为 undefined）。
 */
export function laserScanToXY(
  scan: LaserScanMessage,
): { xy: Float32Array; intensity: Float32Array | undefined } {
  const ranges = scan.ranges
  const useIntensity = !!scan.intensities && scan.intensities.length > 0
  const xy: number[] = []
  const intensity: number[] = []
  const angleMin = numOr0(scan.angle_min)
  const increment = numOr0(scan.angle_increment)
  const rangeMin = numOr0(scan.range_min)
  const rangeMax = numOr0(scan.range_max)
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    if (!Number.isFinite(range) || range < rangeMin || range > rangeMax) continue
    const angle = angleMin + increment * i
    xy.push(range * Math.cos(angle), range * Math.sin(angle))
    if (useIntensity) intensity.push(scan.intensities![i])
  }
  return { xy: Float32Array.from(xy), intensity: useIntensity ? Float32Array.from(intensity) : undefined }
}

const FLOAT32_TYPE = 7

/** PointCloud2 → xyz 平铺数组（按 fields 的 x/y/z 偏移取 float32）。 */
export function pointCloud2ToXYZ(cloud: PointCloud2Message): Float32Array {
  const fields = Array.isArray(cloud.fields) ? cloud.fields : []
  const findOffset = (name: string) => {
    const field = fields.find((entry) => entry.name === name && entry.datatype === FLOAT32_TYPE)
    return field?.offset ?? -1
  }
  const xOffset = findOffset('x')
  const yOffset = findOffset('y')
  const zOffset = findOffset('z')
  const pointStep = cloud.point_step > 0 ? cloud.point_step : 12
  const width = Number(cloud.width) || 0
  const height = Number(cloud.height) || 0
  const pointCount = Math.max(0, Math.floor((width * height) || cloud.data.length / pointStep))
  const out = new Float32Array(pointCount * 3)
  const view = toDataView(cloud.data)
  if (!view) return out
  for (let i = 0; i < pointCount; i++) {
    const start = i * pointStep
    if (start + pointStep > view.byteLength) break
    if (xOffset >= 0) out[i * 3] = view.getFloat32(start + xOffset, true)
    if (yOffset >= 0) out[i * 3 + 1] = view.getFloat32(start + yOffset, true)
    if (zOffset >= 0) out[i * 3 + 2] = view.getFloat32(start + zOffset, true)
  }
  return out
}

/** PolygonStamped → xy 平铺数组（首尾不闭合，渲染端按闭合处理）。 */
export function polygonToXY(polygon: PolygonStampedMessage): Float32Array {
  const points = polygon.polygon.points
  const out = new Float32Array(Math.max(0, points.length * 2))
  for (let i = 0; i < points.length; i++) {
    out[i * 2] = points[i]?.x ?? 0
    out[i * 2 + 1] = points[i]?.y ?? 0
  }
  return out
}

/** Path → xy 平铺数组。 */
export function pathToXY(path: PathMessage): Float32Array {
  const poses = path.poses
  const out = new Float32Array(Math.max(0, poses.length * 2))
  for (let i = 0; i < poses.length; i++) {
    out[i * 2] = poses[i]?.pose?.position?.x ?? 0
    out[i * 2 + 1] = poses[i]?.pose?.position?.y ?? 0
  }
  return out
}

export function quaternionToYaw(q: { x: number; y: number; z: number; w: number }): number {
  const { x, y, z, w } = q
  const s = 2 * (w * z + x * y)
  const c = 1 - 2 * (y * y + z * z)
  return Math.atan2(s, c)
}

/** Odometry → base_link 在 odom 系下的位姿。 */
export function odometryToPose(
  odom: OdometryMessage,
): { x: number; y: number; yaw: number; v: number; w: number } {
  const position = odom.pose.pose.position
  const orientation = odom.pose.pose.orientation
  const twist = odom.twist?.twist
  return {
    x: position?.x ?? 0,
    y: position?.y ?? 0,
    yaw: orientation ? quaternionToYaw(orientation) : 0,
    v: twist?.linear?.x ?? 0,
    w: twist?.angular?.z ?? 0,
  }
}

export function twistToVW(twist: TwistMessage): { v: number; w: number } {
  return { v: twist.linear?.x ?? 0, w: twist.angular?.z ?? 0 }
}

/** 平面 xy 点集绕原点旋转 yaw 后平移（用于 laser→base、base→odom 变换）。 */
export function transformXY(xy: Float32Array, dx: number, dy: number, yaw: number): Float32Array {
  if (yaw === 0 && dx === 0 && dy === 0) return xy
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const out = new Float32Array(xy.length)
  for (let i = 0; i + 1 < xy.length; i += 2) {
    const x = xy[i]
    const y = xy[i + 1]
    out[i] = x * cos - y * sin + dx
    out[i + 1] = x * sin + y * cos + dy
  }
  return out
}

// ——— 小工具 ———

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isArrayLike(value: unknown): value is ArrayLike<unknown> {
  return typeof value === 'object' && value !== null && 'length' in (value as object)
}

function numOr0(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toDataView(data: ArrayLike<number>): DataView | undefined {
  if (data instanceof Uint8Array) {
    // DataView 以 byteOffset 为起点，后续偏移一律相对视图，不再叠加 base
    return new DataView(data.buffer, data.byteOffset, data.byteLength)
  }
  if (Array.isArray(data)) {
    return new DataView(Uint8Array.from(data).buffer)
  }
  return undefined
}
