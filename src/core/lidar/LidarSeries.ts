// 绘图序列预提取：加载时对 /cmd_raw、/odom_est、/dwa_scores 各通道一次性走一遍，
// 生成 Float64Array 序列，播放期间 O(1) 供 ECharts 绘制。
import { asOdometry, asTwist, odometryToPose, twistToVW } from './LidarGeometry'
import { parseDwaScores } from './DwaScores'
import { LIDAR_TOPICS } from './SceneFrame'
import type { McapDocument } from './McapDocument'
import type { LidarPlotSeries } from './types'

export function buildPlotSeries(doc: McapDocument): LidarPlotSeries {
  return {
    cmd: buildCmdSeries(doc),
    odom: buildOdomSeries(doc),
    scores: buildScoreSeries(doc),
  }
}

function buildCmdSeries(doc: McapDocument): LidarPlotSeries['cmd'] {
  const count = doc.topicInfo(LIDAR_TOPICS.cmd)?.messageCount ?? 0
  const t: number[] = []
  const v: number[] = []
  const w: number[] = []
  const base = doc.startNs ?? 0
  for (let index = 0; index < count; index++) {
    const message = doc.decodeByIndex(LIDAR_TOPICS.cmd, index)
    const twist = message ? asTwist(message) : undefined
    if (!twist) continue
    t.push(messageTimeNs(doc, LIDAR_TOPICS.cmd, index) - base)
    const vw = twistToVW(twist)
    v.push(vw.v)
    w.push(vw.w)
  }
  return { t: Float64Array.from(t), v: Float64Array.from(v), w: Float64Array.from(w) }
}

function buildOdomSeries(doc: McapDocument): LidarPlotSeries['odom'] {
  const count = doc.topicInfo(LIDAR_TOPICS.odom)?.messageCount ?? 0
  const t: number[] = []
  const x: number[] = []
  const y: number[] = []
  const yaw: number[] = []
  const v: number[] = []
  const w: number[] = []
  const base = doc.startNs ?? 0
  for (let index = 0; index < count; index++) {
    const message = doc.decodeByIndex(LIDAR_TOPICS.odom, index)
    const odom = message ? asOdometry(message) : undefined
    if (!odom) continue
    t.push(messageTimeNs(doc, LIDAR_TOPICS.odom, index) - base)
    const pose = odometryToPose(odom)
    x.push(pose.x)
    y.push(pose.y)
    yaw.push(pose.yaw)
    v.push(pose.v)
    w.push(pose.w)
  }
  return {
    t: Float64Array.from(t),
    x: Float64Array.from(x),
    y: Float64Array.from(y),
    yaw: Float64Array.from(yaw),
    v: Float64Array.from(v),
    w: Float64Array.from(w),
  }
}

function buildScoreSeries(doc: McapDocument): LidarPlotSeries['scores'] {
  const count = doc.topicInfo(LIDAR_TOPICS.scores)?.messageCount ?? 0
  const t: number[] = []
  const planMs: number[] = []
  const bestTot: number[] = []
  const collisionCount: number[] = []
  const evaluated: number[] = []
  const samples: number[] = []
  const success: number[] = []
  const base = doc.startNs ?? 0
  for (let index = 0; index < count; index++) {
    const message = doc.decodeByIndex(LIDAR_TOPICS.scores, index)
    const text = (message as { data?: unknown } | undefined)?.data
    if (typeof text !== 'string') continue
    const scores = parseDwaScores(text)
    if (!scores) continue
    t.push(messageTimeNs(doc, LIDAR_TOPICS.scores, index) - base)
    planMs.push(scores.plan_ms)
    const best = scores.best >= 0 ? scores.candidates[scores.best] : undefined
    bestTot.push(best?.tot ?? NaN)
    let collisions = 0
    for (const candidate of scores.candidates) {
      if (candidate.collision) collisions++
    }
    collisionCount.push(collisions)
    evaluated.push(scores.evaluated)
    samples.push(scores.samples)
    success.push(scores.success ? 1 : 0)
  }
  return {
    t: Float64Array.from(t),
    planMs: Float64Array.from(planMs),
    bestTot: Float64Array.from(bestTot),
    collisionCount: Float64Array.from(collisionCount),
    evaluated: Float64Array.from(evaluated),
    samples: Float64Array.from(samples),
    success: Float64Array.from(success),
  }
}

function messageTimeNs(doc: McapDocument, topic: string, index: number): number {
  return doc.timeAt(topic, index)
}
