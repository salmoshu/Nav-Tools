import type { NumericEpochStore } from './NumericEpochStore'

/** Align time-of-day clocks whose first valid samples straddle midnight. */
export function recordingClockDifference(timestamp: number, reference: number): number {
  const delta = timestamp - reference
  return timestamp < 86_400_000 && reference < 86_400_000 && delta < -43_200_000
    ? delta + 86_400_000
    : delta
}

/** Resolve a rendered (possibly simplified) point back to the full epoch history. */
export function findPositionEpoch(
  history: NumericEpochStore,
  fields: readonly [string, string],
  x: number,
  y: number,
  cursorElapsed: number,
  endIndex = history.length - 1,
): number {
  let selected = -1
  let distance = Infinity
  let timeDistance = Infinity
  for (let index = 0; index <= Math.min(endIndex, history.length - 1); index++) {
    const px = history.getValue(fields[0], index)
    const py = history.getValue(fields[1], index)
    if (px === null || py === null) continue
    const nextDistance = (px - x) ** 2 + (py - y) ** 2
    const nextTimeDistance = Math.abs(history.getElapsedTime(index) - cursorElapsed)
    if (nextDistance < distance || (nextDistance === distance && nextTimeDistance < timeDistance)) {
      selected = index
      distance = nextDistance
      timeDistance = nextTimeDistance
    }
  }
  return selected
}
