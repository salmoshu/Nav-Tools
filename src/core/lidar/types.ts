// LiDAR MCAP 回放的领域类型。
// 数据来源：E-Wagon-Lidar v1.1.0 板上 TraceSink 录制的 MCAP（ROS 2 profile，
// messageEncoding=cdr、schemaEncoding=ros2msg），通道定义见板上
// follow_bringup_standalone/src/trace_schemas.cpp。

/** 单个话题（MCAP channel）的索引摘要。 */
export interface McapTopicInfo {
  channelId: number
  topic: string
  schemaName: string
  messageEncoding: string
  schemaEncoding: string
  messageCount: number
  firstLogTimeNs: number | undefined
  lastLogTimeNs: number | undefined
  /** false 表示 schema 无法解析（该通道消息不可解码，只保留计数） */
  decodable: boolean
}

/** MCAP 文件加载结果（索引 + 摘要）。 */
export interface McapFileMeta {
  profile: string
  library: string
  startNs: number | undefined
  endNs: number | undefined
  /** true = 文件不完整（截断/损坏），内容经流式回退部分挽回 */
  truncated: boolean
  /** mcap Metadata 记录（板上会话指纹等）；多分片归并时带 partIndex 区分来源分片 */
  metadata: { name: string; data: Record<string, string>; partIndex?: number }[]
  /** 加载过程中的非致命问题（不支持压缩、schema 解析失败等）；多分片条目带 [part_N] 前缀 */
  problems: string[]
  topics: McapTopicInfo[]
}

/** 当前播放帧中某话题的一条解码消息。 */
export interface CurrentMessage<T = unknown> {
  topic: string
  index: number
  logTimeNs: number
  message: T
}

/** 当前播放帧：所有话题“播放头之前最近一条”的快照（Foxglove 的 current 语义）。 */
export interface CurrentFrame {
  timeNs: number
  entries: Map<string, CurrentMessage>
}

/** 逐候选评分（/dwa_scores JSON 的强类型视图）。 */
export interface CandidateScore {
  i: number
  v: number
  w: number
  collision?: boolean
  cached?: boolean
  /** 以下分项仅对未碰撞淘汰的候选存在 */
  h?: number
  obs?: number
  vel?: number
  cm?: number
  bonus?: number
  tot?: number
}

/** /dwa_scores 消息的结构化内容。 */
export interface DwaScores {
  frame: number
  plan_seq: number
  success: boolean
  best: number
  samples: number
  evaluated: number
  early_terminated: boolean
  cache_hits: number
  plan_ms: number
  /** [v_min, v_max, w_min, w_max] */
  window: [number, number, number, number]
  cmd: { v: number; w: number }
  candidates: CandidateScore[]
}

/** 回放视图中“车体”的位姿与几何上下文（base_link 系）。 */
export interface RobotView {
  /** base_link 在 odom_est 系下的位置（无里程计数据时 undefined） */
  odomX: number | undefined
  odomY: number | undefined
  odomYaw: number | undefined
  /** 雷达相对 base_link 的平移（来自 /tf，缺省 0） */
  laserOffsetX: number
  laserOffsetY: number
  hasOdom: boolean
}

/** 场景面板一帧的渲染数据（全部是世界系/车体系下的平面几何，单位米）。 */
export interface SceneFrameData {
  timeNs: number
  robot: RobotView
  /** 各点云均为 [x0,y0,x1,y1,…] 平铺数组 */
  scanRawXY: Float32Array | undefined
  scanRawIntensity: Float32Array | undefined
  scanFilteredXY: Float32Array | undefined
  obstaclesXY: Float32Array | undefined
  bestPathXY: Float32Array | undefined
  /** 候选轨迹数组（每条为平铺 xy） */
  candidatePathsXY: Float32Array[]
  footprintXY: Float32Array | undefined
  footprintMarginXY: Float32Array | undefined
  goalXY: { x: number; y: number } | undefined
  /** 里程计轨迹（odom_est 系，播放头之前的历史段） */
  odomTrailXY: Float32Array | undefined
  /** 解码失败或缺失的提示 */
  warnings: string[]
}

/** 绘图面板的预提取时间序列（加载时一次性构建）。 */
export interface LidarPlotSeries {
  cmd: { t: Float64Array; v: Float64Array; w: Float64Array }
  odom: { t: Float64Array; x: Float64Array; y: Float64Array; yaw: Float64Array; v: Float64Array; w: Float64Array }
  scores: {
    t: Float64Array
    planMs: Float64Array
    bestTot: Float64Array
    collisionCount: Float64Array
    evaluated: Float64Array
    samples: Float64Array
    success: Float64Array
  }
}
