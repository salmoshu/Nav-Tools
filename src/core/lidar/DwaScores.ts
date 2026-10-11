// /dwa_scores 消息的 JSON 解析与校验。
// 内容由板上 trace_sink.cpp 的 buildScoresJson 生成，字段以那里为准。
import type { CandidateScore, DwaScores, LocalMapStatus } from './types'

/**
 * local_map 状态标志在 /dwa_scores JSON 中的键名（单一改动点）。
 * 实际格式（车端 trace_sink buildScoresJson 已定稿，样例 localmap-sample.mcap 验证）：
 * 顶层一个组对象，如 "local_map":{"blk":true,"nav_hold":false,"nav_reason":"...","memory_paused":false}
 */
export const LOCAL_MAP_SCORE_KEYS = {
  /** 顶层组对象名 */
  group: 'local_map',
  /** blk 隔断 */
  blk: 'blk',
  /** 导航挂起 */
  navHold: 'nav_hold',
  /** 挂起/隔断原因文本 */
  navReason: 'nav_reason',
  /** 记忆层暂停更新 */
  memoryPaused: 'memory_paused',
} as const

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function num(value: unknown, fallback = NaN): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * 解析 /dwa_scores 的 JSON 文本。宽容解析：字段缺失/类型不符时给默认值，
 * 整体不是对象或 candidates 不是数组时返回 undefined。
 */
export function parseDwaScores(text: string): DwaScores | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isObject(raw)) return undefined
  const candidatesRaw = Array.isArray(raw.candidates) ? raw.candidates : undefined
  if (!candidatesRaw) return undefined

  const candidates: CandidateScore[] = candidatesRaw.map((entry) => {
    if (!isObject(entry)) {
      return { i: -1, v: 0, w: 0, collision: true }
    }
    const candidate: CandidateScore = {
      i: num(entry.i, -1),
      v: num(entry.v, 0),
      w: num(entry.w, 0),
    }
    if (entry.collision === true) candidate.collision = true
    if (entry.cached === true) candidate.cached = true
    // 分项只对进入评分的候选存在；JSON 里没有就不补
    if (typeof entry.h === 'number') {
      candidate.h = entry.h
      candidate.obs = num(entry.obs, 0)
      candidate.vel = num(entry.vel, 0)
      candidate.cm = num(entry.cm, 0)
      candidate.bonus = num(entry.bonus, 0)
      candidate.tot = num(entry.tot, 0)
    }
    return candidate
  })

  const windowRaw = Array.isArray(raw.window) ? raw.window : []
  const cmd = isObject(raw.cmd) ? raw.cmd : {}
  const scores: DwaScores = {
    frame: num(raw.frame, 0),
    plan_seq: num(raw.plan_seq, 0),
    success: bool(raw.success),
    best: num(raw.best, -1),
    samples: num(raw.samples, 0),
    evaluated: num(raw.evaluated, 0),
    early_terminated: bool(raw.early_terminated),
    cache_hits: num(raw.cache_hits, 0),
    plan_ms: num(raw.plan_ms, 0),
    window: [num(windowRaw[0], 0), num(windowRaw[1], 0), num(windowRaw[2], 0), num(windowRaw[3], 0)],
    cmd: { v: num(cmd.v, 0), w: num(cmd.w, 0) },
    candidates,
  }
  const localMap = parseLocalMapStatus(raw)
  if (localMap) scores.local_map = localMap
  return scores
}

/** local_map 状态组：顶层组对象存在才返回（旧录像没有 → undefined，UI 不展示）。 */
function parseLocalMapStatus(raw: Record<string, unknown>): LocalMapStatus | undefined {
  const group = raw[LOCAL_MAP_SCORE_KEYS.group]
  if (!isObject(group)) return undefined
  return {
    blk: flag(group[LOCAL_MAP_SCORE_KEYS.blk]),
    nav_hold: flag(group[LOCAL_MAP_SCORE_KEYS.navHold]),
    nav_reason:
      typeof group[LOCAL_MAP_SCORE_KEYS.navReason] === 'string'
        ? (group[LOCAL_MAP_SCORE_KEYS.navReason] as string)
        : '',
    memory_paused: flag(group[LOCAL_MAP_SCORE_KEYS.memoryPaused]),
  }
}

/** 布尔宽容解析：JSON 布尔直取，数值 0/1 兼容（车端早期样例曾用 int）。 */
function flag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0
  return false
}

/** 找出最优候选的逐项得分（best=-1 或越界时 undefined）。 */
export function bestCandidate(scores: DwaScores): CandidateScore | undefined {
  if (scores.best < 0 || scores.best >= scores.candidates.length) return undefined
  return scores.candidates[scores.best]
}
