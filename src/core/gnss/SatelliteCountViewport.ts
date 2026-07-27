export const SATELLITE_COUNT_LIVE_WINDOW_EPOCHS = 40
export const SATELLITE_COUNT_MIN_VISIBLE_EPOCHS = 2

export interface SatelliteCountViewport {
  /** Inclusive epoch index at the left edge. */
  start: number
  /** Exclusive epoch index at the right edge. */
  end: number
}

export type SatelliteCountViewportMode = 'live' | 'overview'

const EMPTY_VIEWPORT: SatelliteCountViewport = { start: 0, end: 0 }

function normalizeLength(length: number): number {
  return Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0
}

function normalizeEpochCount(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : fallback
}

/**
 * Fits a viewport inside the available epoch indices while preserving its span
 * whenever possible.
 */
export function clampSatelliteCountViewport(
  viewport: SatelliteCountViewport,
  length: number,
  minVisibleEpochs = SATELLITE_COUNT_MIN_VISIBLE_EPOCHS,
): SatelliteCountViewport {
  const safeLength = normalizeLength(length)
  if (safeLength === 0) return { ...EMPTY_VIEWPORT }

  const maximumSpan = safeLength
  const minimumCount = Math.min(
    safeLength,
    normalizeEpochCount(minVisibleEpochs, SATELLITE_COUNT_MIN_VISIBLE_EPOCHS),
  )
  const minimumSpan = minimumCount

  if (!Number.isFinite(viewport.start) || !Number.isFinite(viewport.end)) {
    return { start: 0, end: maximumSpan }
  }

  const low = Math.min(viewport.start, viewport.end)
  const high = Math.max(viewport.start, viewport.end)
  const span = Math.min(maximumSpan, Math.max(minimumSpan, high - low))
  let start = (low + high - span) / 2
  let end = start + span

  if (start < 0) {
    end -= start
    start = 0
  }
  if (end > maximumSpan) {
    start -= end - maximumSpan
    end = maximumSpan
  }

  // Avoid tiny floating-point excursions outside the legal index range.
  return {
    start: Math.max(0, start),
    end: Math.min(maximumSpan, end),
  }
}

/** Returns the full data range, or the neutral [0, 0] range for no data. */
export function fitSatelliteCountViewport(length: number): SatelliteCountViewport {
  const safeLength = normalizeLength(length)
  return {
    start: 0,
    end: safeLength,
  }
}

/**
 * Starts in live mode, showing at most the latest `liveWindow` epochs.
 */
export function createInitialSatelliteCountViewport(
  length: number,
  liveWindow = SATELLITE_COUNT_LIVE_WINDOW_EPOCHS,
): SatelliteCountViewport {
  const safeLength = normalizeLength(length)
  if (safeLength === 0) return { ...EMPTY_VIEWPORT }

  const windowSize = Math.min(
    safeLength,
    normalizeEpochCount(liveWindow, SATELLITE_COUNT_LIVE_WINDOW_EPOCHS),
  )
  return {
    start: safeLength - windowSize,
    end: safeLength,
  }
}

/**
 * Zooms around an epoch-index anchor. A scale below 1 zooms in and a scale
 * above 1 zooms out. The epoch under the mouse remains at the same relative
 * position unless a data boundary is reached.
 */
export function zoomSatelliteCountViewport(
  viewport: SatelliteCountViewport,
  anchorEpoch: number,
  scale: number,
  length: number,
  minVisibleEpochs = SATELLITE_COUNT_MIN_VISIBLE_EPOCHS,
): SatelliteCountViewport {
  const safeLength = normalizeLength(length)
  if (safeLength <= 2) return fitSatelliteCountViewport(safeLength)

  const current = clampSatelliteCountViewport(viewport, safeLength, minVisibleEpochs)
  if (!Number.isFinite(scale) || scale <= 0) return current

  const maximumSpan = safeLength
  const minimumCount = Math.min(
    safeLength,
    normalizeEpochCount(minVisibleEpochs, SATELLITE_COUNT_MIN_VISIBLE_EPOCHS),
  )
  const minimumSpan = minimumCount
  const currentSpan = current.end - current.start
  const nextSpan = Math.min(maximumSpan, Math.max(minimumSpan, currentSpan * scale))
  const safeAnchor = Number.isFinite(anchorEpoch)
    ? Math.min(current.end, Math.max(current.start, anchorEpoch))
    : (current.start + current.end) / 2
  const anchorRatio = currentSpan > 0 ? (safeAnchor - current.start) / currentSpan : 0.5

  return clampSatelliteCountViewport(
    {
      start: safeAnchor - nextSpan * anchorRatio,
      end: safeAnchor + nextSpan * (1 - anchorRatio),
    },
    safeLength,
    minVisibleEpochs,
  )
}

/** Moves a viewport by an epoch-index delta and clamps it to the data range. */
export function panSatelliteCountViewport(
  viewport: SatelliteCountViewport,
  deltaEpochs: number,
  length: number,
  minVisibleEpochs = SATELLITE_COUNT_MIN_VISIBLE_EPOCHS,
): SatelliteCountViewport {
  const current = clampSatelliteCountViewport(viewport, length, minVisibleEpochs)
  if (!Number.isFinite(deltaEpochs) || deltaEpochs === 0) return current

  return clampSatelliteCountViewport(
    {
      start: current.start + deltaEpochs,
      end: current.end + deltaEpochs,
    },
    length,
    minVisibleEpochs,
  )
}

/**
 * Reconciles a viewport after the data length changes.
 *
 * Live mode always follows the newest epoch. Overview mode fits only on the
 * first data arrival (or when no viewport exists), then preserves the user's
 * range as new epochs are appended.
 */
export function updateSatelliteCountViewportOnData(
  viewport: SatelliteCountViewport | undefined,
  previousLength: number,
  nextLength: number,
  mode: SatelliteCountViewportMode,
  liveWindow = SATELLITE_COUNT_LIVE_WINDOW_EPOCHS,
  minVisibleEpochs = SATELLITE_COUNT_MIN_VISIBLE_EPOCHS,
): SatelliteCountViewport {
  const safePreviousLength = normalizeLength(previousLength)
  const safeNextLength = normalizeLength(nextLength)

  if (safeNextLength === 0) return { ...EMPTY_VIEWPORT }
  if (mode === 'live') {
    return createInitialSatelliteCountViewport(safeNextLength, liveWindow)
  }
  if (!viewport || safePreviousLength === 0) {
    return fitSatelliteCountViewport(safeNextLength)
  }

  return clampSatelliteCountViewport(viewport, safeNextLength, minVisibleEpochs)
}
