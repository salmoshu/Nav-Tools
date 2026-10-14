// /planner_state is the outgoing Lidar request, not proof of Host selection or MCU execution.
import type { CurrentFrame, DwaScores } from './types'
import { parseDwaScores } from './DwaScores'

export interface InputFreshness {
  known: boolean
  present: boolean
  fresh: boolean
  sequence: string
  age_ms: number | null
}

export interface PlannerState {
  frame: number
  enabled: boolean
  success: boolean
  has_observation: boolean
  has_pose: boolean
  has_scan_pose: boolean
  scan_capture_valid: boolean
  scan_capture_ns: string | null
  scan_pose_ns: string | null
  pose_ns: string | null
  processing_start_ns: string
  command_ns: string
  command_done_ns: string
  source: string
  cmd: { v: number; w: number }
  dispatch: { sink_present: boolean; attempted: boolean; accepted: boolean; state: string }
  local_map: { active: boolean; blk: boolean; nav_hold: boolean; nav_reason: string; memory_paused: boolean }
  wheel: InputFreshness
  target: InputFreshness
  bypass: {
    attempted: boolean
    search_ns: string | null
    found: boolean
    complete: boolean
    reason: string
    start_unknown: boolean
    start_occupied: boolean
    start_clearance_blocked: boolean
    goal_outside_window: boolean
    goal_unknown: boolean
    goal_clearance_blocked: boolean
    terminal_candidates: number
    terminal_unknown: number
    terminal_clearance_blocked: number
    terminal_disconnected: number
    terminal_footprint_blocked: number
    reachable_cells: number
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
function ns(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value)
}
function optionalNs(value: unknown): value is string | null {
  return value === null || ns(value)
}
function flags(raw: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof raw[key] === 'boolean')
}
function freshness(raw: unknown): raw is InputFreshness {
  return object(raw) && flags(raw, ['known', 'present', 'fresh']) && ns(raw.sequence) &&
    (raw.age_ms === null || finite(raw.age_ms))
}

/** Invalid state stays unavailable; never fabricate a zero command or a successful dispatch. */
export function parsePlannerState(message: unknown): PlannerState | undefined {
  if (!object(message) || typeof message.data !== 'string') return undefined
  let raw: unknown
  try { raw = JSON.parse(message.data) } catch { return undefined }
  if (!object(raw) || !finite(raw.frame) || !Number.isInteger(raw.frame) || !flags(raw, [
    'enabled', 'success', 'has_observation', 'has_pose', 'has_scan_pose', 'scan_capture_valid',
  ]) || typeof raw.source !== 'string' || !optionalNs(raw.pose_ns) ||
      !optionalNs(raw.scan_pose_ns) || !optionalNs(raw.scan_capture_ns) ||
      !ns(raw.processing_start_ns) || !ns(raw.command_ns) || !ns(raw.command_done_ns)) return undefined
  const { cmd, dispatch, local_map: map, bypass } = raw
  if (!object(cmd) || !finite(cmd.v) || !finite(cmd.w) || !object(dispatch) ||
      !flags(dispatch, ['sink_present', 'attempted', 'accepted']) || typeof dispatch.state !== 'string' ||
      !object(map) || !flags(map, ['active', 'blk', 'nav_hold', 'memory_paused']) ||
      typeof map.nav_reason !== 'string' || !freshness(raw.wheel) || !freshness(raw.target) ||
      !object(bypass) || !flags(bypass, ['attempted', 'found', 'complete', 'start_unknown',
        'start_occupied', 'start_clearance_blocked', 'goal_outside_window', 'goal_unknown',
        'goal_clearance_blocked']) || !optionalNs(bypass.search_ns) || typeof bypass.reason !== 'string' ||
      !['terminal_candidates', 'terminal_unknown', 'terminal_clearance_blocked',
        'terminal_disconnected', 'terminal_footprint_blocked', 'reachable_cells'].every(
          (key) => finite(bypass[key]),
        )) return undefined
  return raw as unknown as PlannerState
}

/** Latest score is only current when the authoritative per-frame state says it was observed. */
export function currentFrameScores(frame: CurrentFrame, hasPlannerState: boolean): DwaScores | undefined {
  const scoreEntry = frame.entries.get('/dwa_scores')
  const message = scoreEntry?.message
  const text = object(message) ? message.data : undefined
  const scores = typeof text === 'string' ? parseDwaScores(text) : undefined
  if (!hasPlannerState) return scores
  const stateEntry = frame.entries.get('/planner_state')
  const state = parsePlannerState(stateEntry?.message)
  return state?.has_observation && !state.local_map.nav_hold && scores?.frame === state.frame &&
    scoreEntry?.logTimeNs === stateEntry?.logTimeNs
    ? scores : undefined
}

/** Path event time belongs to the plan dispatch event, not to the current odometry. */
export function currentPlanEventNs(frame: CurrentFrame): number | undefined {
  const entry = frame.entries.get('/planner_state')
  const state = parsePlannerState(entry?.message)
  return state?.has_observation && !state.local_map.nav_hold ? entry?.logTimeNs : undefined
}
