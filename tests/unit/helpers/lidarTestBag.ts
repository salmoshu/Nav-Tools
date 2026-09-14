// 测试辅助：用 @mcap/core + MessageWriter 构造与 E-Wagon-Lidar 板上 TraceSink
// 同构的 MCAP（ros2 profile / cdr / ros2msg schema 文本）。
// schema 文本逐字对齐板上 follow_bringup_standalone/src/trace_schemas.cpp。
import { McapWriter } from '@mcap/core'
import { parse } from '@foxglove/rosmsg'
import { MessageWriter } from '@foxglove/rosmsg2-serialization'

export const SCHEMA_LASER_SCAN = `std_msgs/Header stamp
float32 angle_min
float32 angle_max
float32 angle_increment
float32 time_increment
float32 scan_time
float32 range_min
float32 range_max
float32[] ranges
float32[] intensities
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`

export const SCHEMA_POINT_CLOUD2 = `std_msgs/Header stamp
uint32 height
uint32 width
sensor_msgs/PointField[] fields
bool is_bigendian
uint32 point_step
uint32 row_step
uint8[] data
bool is_dense
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
================================================================================
MSG: sensor_msgs/PointField
uint8 INT8=1
uint8 UINT8=2
uint8 INT16=3
uint8 UINT16=4
uint8 INT32=5
uint8 UINT32=6
uint8 FLOAT32=7
uint8 FLOAT64=8
string name
uint32 offset
uint8 datatype
uint32 count`

export const SCHEMA_TF_MESSAGE = `geometry_msgs/TransformStamped[] transforms
================================================================================
MSG: geometry_msgs/TransformStamped
std_msgs/Header stamp
string child_frame_id
geometry_msgs/Transform transform
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/Transform
geometry_msgs/Vector3 translation
geometry_msgs/Quaternion rotation
================================================================================
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`

export const SCHEMA_POLYGON_STAMPED = `std_msgs/Header stamp
geometry_msgs/Polygon polygon
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/Polygon
geometry_msgs/Point32[] points
================================================================================
MSG: geometry_msgs/Point32
float32 x
float32 y
float32 z`

export const SCHEMA_PATH = `std_msgs/Header stamp
geometry_msgs/PoseStamped[] poses
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/PoseStamped
std_msgs/Header stamp
geometry_msgs/Pose pose
================================================================================
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`

export const SCHEMA_POSE_STAMPED = `std_msgs/Header stamp
geometry_msgs/Pose pose
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`

export const SCHEMA_ODOMETRY = `std_msgs/Header stamp
string child_frame_id
geometry_msgs/PoseWithCovariance pose
geometry_msgs/TwistWithCovariance twist
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/PoseWithCovariance
geometry_msgs/Pose pose
float64[36] covariance
================================================================================
MSG: geometry_msgs/Pose
geometry_msgs/Point position
geometry_msgs/Quaternion orientation
================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w
================================================================================
MSG: geometry_msgs/TwistWithCovariance
geometry_msgs/Twist twist
float64[36] covariance
================================================================================
MSG: geometry_msgs/Twist
geometry_msgs/Vector3 linear
geometry_msgs/Vector3 angular
================================================================================
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z`

export const SCHEMA_TWIST = `geometry_msgs/Vector3 linear
geometry_msgs/Vector3 angular
================================================================================
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z`

export const SCHEMA_STRING = `string data`

export interface BagMessageInput {
  logTimeNs: bigint
  message: unknown
}

export interface BagChannelInput {
  topic: string
  schemaName: string
  schemaText: string
  messages: BagMessageInput[]
}

export interface BuiltBag {
  bytes: Uint8Array
  topic: string
}

export interface BuildBagOptions {
  /** mcap Metadata 记录（板上会话指纹），写于消息之后、文件收尾之前 */
  metadata?: { name: string; data: Record<string, string> }[]
  /** 透传给 McapWriter 的 chunk 压缩钩子（测试压缩提示路径时用假压缩即可） */
  compressChunk?: (chunkData: Uint8Array) => { compression: string; compressedData: Uint8Array }
}

/** 把多个通道写成一份 MCAP（无压缩、有索引，与板上 TraceSink 一致）。 */
export async function buildMcapBytes(
  channels: BagChannelInput[],
  options: BuildBagOptions = {},
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let position = 0n
  const writer = new McapWriter({
    writable: {
      write: async (buffer: Uint8Array) => {
        chunks.push(buffer.slice())
        position += BigInt(buffer.byteLength)
      },
      position: () => position,
    },
    compressChunk: options.compressChunk,
  })
  await writer.start({ profile: 'ros2', library: 'nav-tools-test' })
  for (const channel of channels) {
    const definitions = parse(channel.schemaText, { ros2: true })
    const messageWriter = new MessageWriter(definitions)
    const schemaId = await writer.registerSchema({
      name: channel.schemaName,
      encoding: 'ros2msg',
      data: new TextEncoder().encode(channel.schemaText),
    })
    const channelId = await writer.registerChannel({
      schemaId,
      topic: channel.topic,
      messageEncoding: 'cdr',
      metadata: new Map(),
    })
    for (const message of channel.messages) {
      const data = messageWriter.writeMessage(message.message)
      await writer.addMessage({
        channelId,
        sequence: 0,
        logTime: message.logTimeNs,
        publishTime: message.logTimeNs,
        data,
      })
    }
  }
  for (const entry of options.metadata ?? []) {
    await writer.addMetadata({ name: entry.name, metadata: new Map(Object.entries(entry.data)) })
  }
  await writer.end()
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/** 消息便捷构造器（字段名与板上 schema 一致）。
 * 注意：Header 的值 = { stamp: Time{sec,nanosec}, frame_id }（板上 schema 的
 * 两层字段都叫 stamp，解码后 scan.stamp.stamp 才是 Time，见探针验证）。 */
export function header(frameId: string, sec: number, nanosec: number) {
  return { stamp: { sec, nanosec }, frame_id: frameId }
}

export function makeLaserScan(
  frameId: string,
  sec: number,
  nanosec: number,
  ranges: number[],
  angleMin = -Math.PI,
  angleIncrement = (2 * Math.PI) / ranges.length,
  intensity?: number[],
) {
  return {
    stamp: header(frameId, sec, nanosec),
    angle_min: angleMin,
    angle_max: angleMin + angleIncrement * (ranges.length - 1),
    angle_increment: angleIncrement,
    time_increment: 0,
    scan_time: 0.1,
    range_min: 0.1,
    range_max: 12,
    ranges,
    intensities: intensity ?? [],
  }
}

export function makePath(frameId: string, sec: number, nanosec: number, points: [number, number][]) {
  return {
    stamp: header(frameId, sec, nanosec),
    poses: points.map(([x, y]) => ({
      stamp: header('', sec, nanosec),
      pose: { position: { x, y, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    })),
  }
}

export function makeTf(laserOffsetX: number, sec: number, nanosec: number) {
  return {
    transforms: [
      {
        stamp: header('base_link', sec, nanosec),
        child_frame_id: 'laser',
        transform: {
          translation: { x: laserOffsetX, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
    ],
  }
}

export function makePolygon(frameId: string, sec: number, nanosec: number, points: [number, number][]) {
  return {
    stamp: header(frameId, sec, nanosec),
    polygon: { points: points.map(([x, y]) => ({ x, y, z: 0 })) },
  }
}

export function makeOdometry(
  frameId: string,
  sec: number,
  nanosec: number,
  x: number,
  y: number,
  yaw: number,
  v: number,
  w: number,
) {
  const halfYaw = yaw / 2
  return {
    stamp: header(frameId, sec, nanosec),
    child_frame_id: 'base_link',
    pose: {
      pose: {
        position: { x, y, z: 0 },
        orientation: { x: 0, y: 0, z: Math.sin(halfYaw), w: Math.cos(halfYaw) },
      },
    },
    twist: {
      twist: { linear: { x: v, y: 0, z: 0 }, angular: { x: 0, y: 0, z: w } },
    },
  }
}

export function makeTwist(v: number, w: number) {
  return { linear: { x: v, y: 0, z: 0 }, angular: { x: 0, y: 0, z: w } }
}

export function makeString(text: string) {
  return { data: text }
}

/** PointCloud2：n 个 float32 (x,y,z) 点。 */
export function makePointCloud2(
  frameId: string,
  sec: number,
  nanosec: number,
  points: [number, number, number][],
) {
  const data = new Uint8Array(points.length * 12)
  const view = new DataView(data.buffer)
  points.forEach(([x, y, z], index) => {
    view.setFloat32(index * 12, x, true)
    view.setFloat32(index * 12 + 4, y, true)
    view.setFloat32(index * 12 + 8, z, true)
  })
  return {
    stamp: header(frameId, sec, nanosec),
    height: 1,
    width: points.length,
    fields: [
      { name: 'x', offset: 0, datatype: 7, count: 1 },
      { name: 'y', offset: 4, datatype: 7, count: 1 },
      { name: 'z', offset: 8, datatype: 7, count: 1 },
    ],
    is_bigendian: false,
    point_step: 12,
    row_step: points.length * 12,
    data,
    is_dense: true,
  }
}
