import { validateNmeaChecksum } from '@/core/data/NmeaStreamParser'
import { detectGnssTextParser, type GnssTextParser } from '@/core/data/GnssTextFormat'
import { RtkSolutionParser } from '@/core/gnsslib/RtkSolution'

export const TRACK_TIME_TOLERANCE_MS = 25

export interface TrackEpoch {
  timeMs: number
  timeLabel: string
  latitude: number
  longitude: number
  height: number | null
  quality: number
  speedKmh?: number | null
}

export interface EnuTrackEpoch extends TrackEpoch {
  east: number
  north: number
  up: number
}

export interface TrackDifference {
  timeMs: number
  timeLabel: string
  east: number
  north: number
  up: number | null
  quality: number
}

export interface TrackComparison {
  trackA: EnuTrackEpoch[]
  trackB: EnuTrackEpoch[]
  differences: TrackDifference[]
}

export interface ParsedTrackFile {
  format: GnssTextParser
  points: TrackEpoch[]
}

export interface TrackEpochHistory {
  readonly length: number
  readonly fields: readonly string[]
  getTimestamp(index: number): number
  getValue(field: string, index: number): number | null
  formatTime(index: number): string
}

export function readPrimaryTrackEpochs(
  mapHistory: TrackEpochHistory,
  positionHistory: TrackEpochHistory,
  statusHistory?: TrackEpochHistory,
): TrackEpoch[] {
  if (statusHistory && positionHistory.length === 0) return []
  const points: TrackEpoch[] = []
  const hasSolverHeight = positionHistory.fields.includes('HEIGHT')
  for (let index = 0; index < mapHistory.length; index += 1) {
    const latitude = mapHistory.getValue('LATITUDE', index)
    const longitude = mapHistory.getValue('LONGITUDE', index)
    if (
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      continue
    }
    const statusIndex = statusHistory && index < statusHistory.length ? index : -1
    const statusDate =
      statusHistory && statusIndex >= 0 ? statusHistory.getValue('DATE', statusIndex) : null
    const solverDate =
      positionHistory.fields.includes('DATE') && index < positionHistory.length
        ? positionHistory.getValue('DATE', index)
        : null
    const date = statusDate ?? solverDate
    const day = date === null ? '' : `${new Date(date * 86_400_000).toISOString().slice(0, 10)} `
    const wallTime = Date.parse(`1970-01-01T${mapHistory.formatTime(index)}Z`)
    points.push({
      timeMs: date === null ? mapHistory.getTimestamp(index) : date * 86_400_000 + wallTime,
      timeLabel: `${day}${mapHistory.formatTime(index)}`,
      latitude,
      longitude,
      height:
        statusHistory && statusIndex >= 0
          ? statusHistory.getValue('ALTITUDE', statusIndex)
          : hasSolverHeight
            ? positionHistory.getValue('HEIGHT', index)
            : null,
      quality: mapHistory.getValue('QUALITY', index) ?? 0,
    })
  }
  return points
}

export interface TrackDifferenceStats {
  count: number
  meanEast: number
  meanNorth: number
  meanUp: number | null
  rmsEast: number
  rmsNorth: number
  rmsUp: number | null
  rmsHorizontal: number
  stdUp: number | null
  maxHorizontal: number
}

const WGS84_A = 6378137
const WGS84_E2 = 6.6943799901413165e-3

function finite(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function coordinate(value: string | undefined, hemisphere: string | undefined): number | null {
  if (!value || !hemisphere) return null
  const raw = Number(value)
  if (!Number.isFinite(raw)) return null
  const isLatitude = hemisphere === 'N' || hemisphere === 'S'
  const isLongitude = hemisphere === 'E' || hemisphere === 'W'
  if (!isLatitude && !isLongitude) return null
  const degrees = Math.floor(raw / 100)
  const minutes = raw - degrees * 100
  if (minutes < 0 || minutes >= 60) return null
  const sign = hemisphere === 'S' || hemisphere === 'W' ? -1 : 1
  const result = sign * (degrees + minutes / 60)
  if (isLatitude && Math.abs(result) > 90) return null
  if (isLongitude && Math.abs(result) > 180) return null
  return result
}

function nmeaTime(value: string | undefined): number | null {
  const match = value?.match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3])
  if (hour > 23 || minute > 59 || second >= 60) return null
  return (hour * 3600 + minute * 60 + second) * 1000
}

function nmeaDate(value: string | undefined): number | null {
  const match = value?.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const shortYear = Number(match[3])
  const year = shortYear >= 80 ? 1900 + shortYear : 2000 + shortYear
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return timestamp
}

function timeLabel(timeMs: number): string {
  const milliseconds = Math.floor(timeMs % 1000)
  return `${new Date(timeMs - milliseconds).toISOString().replace('T', ' ').slice(0, 19)}.${String(milliseconds).padStart(3, '0')}`
}

interface NmeaPosition {
  timeOfDayMs: number
  dayMs: number | null
  latitude: number
  longitude: number
  height: number | null
  quality: number
  speedKmh: number | null
  source: 'GGA' | 'RMC'
}

function nmeaSentences(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\$[A-Z0-9]{2}(?:GGA|RMC),/.test(line) && validateNmeaChecksum(line))
}

function parseNmeaPosition(sentence: string, rmcDays: Map<number, number>): NmeaPosition | null {
  const fields = sentence.slice(1, sentence.indexOf('*')).split(',')
  const type = fields[0]?.slice(-3)
  const timeOfDayMs = nmeaTime(fields[1])
  if (timeOfDayMs === null) return null

  if (type === 'GGA') {
    const quality = finite(fields[6])
    if (quality === null || !Number.isInteger(quality) || quality <= 0 || quality > 8) {
      return null
    }
    const latitude = coordinate(fields[2], fields[3])
    const longitude = coordinate(fields[4], fields[5])
    if (latitude === null || longitude === null || (latitude === 0 && longitude === 0)) return null
    return {
      timeOfDayMs,
      dayMs: rmcDays.get(timeOfDayMs) ?? null,
      latitude,
      longitude,
      height: finite(fields[9]),
      quality,
      speedKmh: null,
      source: 'GGA',
    }
  }

  if (type === 'RMC' && fields[2] === 'A') {
    const latitude = coordinate(fields[3], fields[4])
    const longitude = coordinate(fields[5], fields[6])
    const dayMs = nmeaDate(fields[9])
    if (latitude === null || longitude === null || dayMs === null) return null
    if (latitude === 0 && longitude === 0) return null
    const mode = fields[12] ?? ''
    const quality = mode === 'N' ? 0 : mode === 'R' ? 4 : mode === 'F' ? 5 : mode === 'D' ? 2 : 1
    if (quality === 0) return null
    const speedKnots = finite(fields[7])
    return {
      timeOfDayMs,
      dayMs,
      latitude,
      longitude,
      height: null,
      quality,
      speedKmh: speedKnots === null ? null : speedKnots * 1.852,
      source: 'RMC',
    }
  }
  return null
}

function parseNmeaTrack(text: string): TrackEpoch[] {
  const sentences = nmeaSentences(text)
  const rmcDays = new Map<number, number>()
  for (const sentence of sentences) {
    if (!sentence.slice(1, 6).endsWith('RMC')) continue
    const fields = sentence.slice(1, sentence.indexOf('*')).split(',')
    const timeOfDayMs = nmeaTime(fields[1])
    const dayMs = nmeaDate(fields[9])
    if (timeOfDayMs !== null && dayMs !== null) rmcDays.set(timeOfDayMs, dayMs)
  }

  const points: Array<TrackEpoch & { source: NmeaPosition['source'] }> = []
  for (const sentence of sentences) {
    const parsed = parseNmeaPosition(sentence, rmcDays)
    if (!parsed) continue
    const timeMs = (parsed.dayMs ?? 0) + parsed.timeOfDayMs
    const previous = points.at(-1)
    if (previous && previous.timeMs === timeMs) {
      const position = previous.source === 'GGA' ? previous : parsed
      points[points.length - 1] = {
        timeMs,
        timeLabel: timeLabel(timeMs),
        latitude: position.latitude,
        longitude: position.longitude,
        height: position.height,
        quality: position.quality,
        speedKmh: parsed.speedKmh ?? previous.speedKmh ?? null,
        source: position.source,
      }
      continue
    }
    points.push({
      timeMs,
      timeLabel: timeLabel(timeMs),
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      height: parsed.height,
      quality: parsed.quality,
      speedKmh: parsed.speedKmh,
      source: parsed.source,
    })
  }
  return points.map(({ source: _, ...point }) => point)
}

function rtkQualityToGnssQuality(quality: number): number {
  if (quality === 1) return 4
  if (quality === 2) return 5
  if (quality === 3 || quality === 4) return 2
  if (quality === 5 || quality === 7) return 1
  if (quality === 6) return 6
  return 0
}

function solutionTimeMs(time: string): number | null {
  const match = time.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const second = Number(match[6])
  const timeMs = Date.UTC(year, month - 1, day, hour, minute) + second * 1000
  const date = new Date(timeMs)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    return null
  }
  return Math.round(timeMs)
}

function parseRtkTrack(text: string): TrackEpoch[] {
  const parser = new RtkSolutionParser()
  const points: TrackEpoch[] = []
  for (const line of text.split(/\r?\n/)) {
    const solution = parser.addLine(line)
    if (!solution || Math.abs(solution.latitude) > 90 || Math.abs(solution.longitude) > 180) {
      continue
    }
    const timeMs = solutionTimeMs(solution.time)
    if (timeMs === null) continue
    points.push({
      timeMs,
      timeLabel: solution.time,
      latitude: solution.latitude,
      longitude: solution.longitude,
      height: solution.height,
      quality: rtkQualityToGnssQuality(solution.quality),
    })
  }
  return points
}

/** Parse comparison files without publishing anything to the global GNSS store. */
export function parseTrackFile(text: string): ParsedTrackFile | null {
  const format = detectGnssTextParser(text)
  if (!format) return null
  return {
    format,
    points: format === 'nmea' ? parseNmeaTrack(text) : parseRtkTrack(text),
  }
}

function toEcef(point: TrackEpoch): [number, number, number] {
  const latitude = (point.latitude * Math.PI) / 180
  const longitude = (point.longitude * Math.PI) / 180
  const sinLatitude = Math.sin(latitude)
  const cosLatitude = Math.cos(latitude)
  const radius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLatitude * sinLatitude)
  return [
    (radius + (point.height ?? 0)) * cosLatitude * Math.cos(longitude),
    (radius + (point.height ?? 0)) * cosLatitude * Math.sin(longitude),
    (radius * (1 - WGS84_E2) + (point.height ?? 0)) * sinLatitude,
  ]
}

function toEnu(point: TrackEpoch, origin: TrackEpoch): EnuTrackEpoch {
  const [x, y, z] = toEcef(point)
  const [x0, y0, z0] = toEcef(origin)
  const latitude = (origin.latitude * Math.PI) / 180
  const longitude = (origin.longitude * Math.PI) / 180
  const sinLatitude = Math.sin(latitude)
  const cosLatitude = Math.cos(latitude)
  const sinLongitude = Math.sin(longitude)
  const cosLongitude = Math.cos(longitude)
  const dx = x - x0
  const dy = y - y0
  const dz = z - z0
  return {
    ...point,
    east: -sinLongitude * dx + cosLongitude * dy,
    north: -sinLatitude * cosLongitude * dx - sinLatitude * sinLongitude * dy + cosLatitude * dz,
    up: cosLatitude * cosLongitude * dx + cosLatitude * sinLongitude * dy + sinLatitude * dz,
  }
}

function ascending(points: EnuTrackEpoch[]): EnuTrackEpoch[] {
  return points
    .map((point, index) => ({ point, index }))
    .sort((a, b) => a.point.timeMs - b.point.timeMs || a.index - b.index)
    .map(({ point }) => point)
}

/** Use A's first valid position as the common origin, including when B loaded first. */
export function compareTracks(
  inputA: readonly TrackEpoch[],
  inputB: readonly TrackEpoch[],
  toleranceMs = TRACK_TIME_TOLERANCE_MS,
): TrackComparison | null {
  const origin = inputA[0] ?? inputB[0]
  if (!origin) return null
  const trackA = inputA.map((point) => toEnu(point, origin))
  const trackB = inputB.map((point) => toEnu(point, origin))
  const sortedA = ascending(trackA)
  const sortedB = ascending(trackB)
  const differences: TrackDifference[] = []
  let indexA = 0
  let indexB = 0
  while (indexA < sortedA.length && indexB < sortedB.length) {
    const a = sortedA[indexA]
    const b = sortedB[indexB]
    const delta = a.timeMs - b.timeMs
    if (delta < -toleranceMs) {
      indexA += 1
      continue
    }
    if (delta > toleranceMs) {
      indexB += 1
      continue
    }
    differences.push({
      timeMs: a.timeMs,
      timeLabel: a.timeLabel,
      east: a.east - b.east,
      north: a.north - b.north,
      up: a.height === null || b.height === null ? null : a.up - b.up,
      quality: Math.max(a.quality, b.quality),
    })
    indexA += 1
    indexB += 1
  }
  return { trackA, trackB, differences }
}

export function trackSpeedKmh(points: readonly TrackEpoch[]): Array<number | null> {
  const positions = compareTracks(points, [])?.trackA ?? []
  const speeds: Array<number | null> = Array.from({ length: points.length }, () => null)
  for (let index = 0; index < points.length; index += 1) {
    const reported = points[index].speedKmh
    if (typeof reported === 'number' && Number.isFinite(reported)) {
      speeds[index] = reported
      continue
    }
    if (index === 0) continue
    const elapsedSeconds = (points[index].timeMs - points[index - 1].timeMs) / 1000
    if (elapsedSeconds <= 0) continue
    const east = positions[index].east - positions[index - 1].east
    const north = positions[index].north - positions[index - 1].north
    speeds[index] = (Math.hypot(east, north) / elapsedSeconds) * 3.6
  }
  return speeds
}

export function toDeviationPoints(
  points: readonly { east: number; north: number; quality: number }[],
): Array<[number, number, number]> {
  return points.map((point) => [point.east, point.north, point.quality])
}

export function computeTrackDifferenceStats(
  differences: readonly TrackDifference[],
): TrackDifferenceStats | null {
  if (differences.length === 0) return null
  let east = 0
  let north = 0
  let up = 0
  let squaredEast = 0
  let squaredNorth = 0
  let squaredUp = 0
  let verticalCount = 0
  let maxHorizontal = 0
  for (const difference of differences) {
    east += difference.east
    north += difference.north
    squaredEast += difference.east * difference.east
    squaredNorth += difference.north * difference.north
    if (difference.up !== null) {
      up += difference.up
      squaredUp += difference.up * difference.up
      verticalCount += 1
    }
    maxHorizontal = Math.max(maxHorizontal, Math.hypot(difference.east, difference.north))
  }
  const count = differences.length
  return {
    count,
    meanEast: east / count,
    meanNorth: north / count,
    meanUp: verticalCount > 0 ? up / verticalCount : null,
    rmsEast: Math.sqrt(squaredEast / count),
    rmsNorth: Math.sqrt(squaredNorth / count),
    rmsUp: verticalCount > 0 ? Math.sqrt(squaredUp / verticalCount) : null,
    rmsHorizontal: Math.sqrt((squaredEast + squaredNorth) / count),
    stdUp:
      verticalCount > 0
        ? Math.sqrt(Math.max(0, squaredUp / verticalCount - (up / verticalCount) ** 2))
        : null,
    maxHorizontal,
  }
}
