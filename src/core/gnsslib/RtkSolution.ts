/**
 * Parser for the text solution formats emitted by Robo-GNSS/RTKLIB.
 *
 * RTKLIB uses the .pos suffix for several text layouts.  The header emitted
 * by solution.c is the format contract, so rows are decoded from the header
 * instead of assuming one fixed set of columns.
 */

export type RtkSolutionFormat = 'llh' | 'xyz' | 'enu'
export type RtkSolutionTimeFormat = 'hms' | 'tow'
export type RtkSolutionTimeSystem = 'gpst' | 'utc' | 'jst'

export interface RtkSolutionReference {
  latitude: number
  longitude: number
  height: number
}

export interface RtkSolution {
  time: string
  latitude: number
  longitude: number
  height: number
  quality: number
  satellites: number
  sdn: number | null
  sde: number | null
  sdu: number | null
  sdne: number | null
  sdeu: number | null
  sdun: number | null
  age: number | null
  ratio: number | null
  format: RtkSolutionFormat
  raw: string
}

export interface RtkSolutionParserOptions {
  format?: RtkSolutionFormat
  timeFormat?: RtkSolutionTimeFormat
  timeSystem?: RtkSolutionTimeSystem
  dms?: boolean
  reference?: RtkSolutionReference
}

interface RtkSolutionParserState {
  format: RtkSolutionFormat
  timeFormat: RtkSolutionTimeFormat
  timeSystem: RtkSolutionTimeSystem
  dms: boolean
  reference?: RtkSolutionReference
}

const GPS_EPOCH_MS = Date.UTC(1980, 0, 6)
const GPS_WEEK_MS = 7 * 86_400_000
const WGS84_A = 6378137
const WGS84_E2 = 6.6943799901413165e-3

function finite(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function integer(value: string | undefined): number | null {
  const parsed = finite(value)
  return parsed !== null && Number.isInteger(parsed) ? parsed : null
}

function splitFields(line: string): string[] {
  return line.trim().replace(/[,;]+/g, ' ').split(/\s+/).filter(Boolean)
}

function dmsToDegrees(degrees: number, minutes: number, seconds: number): number {
  const sign = degrees < 0 || Object.is(degrees, -0) ? -1 : 1
  return sign * (Math.abs(degrees) + Math.abs(minutes) / 60 + Math.abs(seconds) / 3600)
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI
}

function ecefToLlh(x: number, y: number, z: number): RtkSolutionReference | null {
  const p = Math.hypot(x, y)
  if (!Number.isFinite(p) || !Number.isFinite(z) || p < 1e-9) return null

  let latitude = Math.atan2(z, p * (1 - WGS84_E2))
  let height = 0
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const sinLatitude = Math.sin(latitude)
    const normalRadius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLatitude * sinLatitude)
    height = p / Math.cos(latitude) - normalRadius
    const nextLatitude = Math.atan2(
      z,
      p * (1 - (WGS84_E2 * normalRadius) / (normalRadius + height)),
    )
    if (Math.abs(nextLatitude - latitude) < 1e-12) {
      latitude = nextLatitude
      break
    }
    latitude = nextLatitude
  }

  const sinLatitude = Math.sin(latitude)
  const normalRadius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLatitude * sinLatitude)
  height = p / Math.cos(latitude) - normalRadius
  return {
    latitude: radiansToDegrees(latitude),
    longitude: radiansToDegrees(Math.atan2(y, x)),
    height,
  }
}

function llhToEcef(reference: RtkSolutionReference): [number, number, number] {
  const latitude = degreesToRadians(reference.latitude)
  const longitude = degreesToRadians(reference.longitude)
  const sinLatitude = Math.sin(latitude)
  const cosLatitude = Math.cos(latitude)
  const normalRadius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLatitude * sinLatitude)
  return [
    (normalRadius + reference.height) * cosLatitude * Math.cos(longitude),
    (normalRadius + reference.height) * cosLatitude * Math.sin(longitude),
    (normalRadius * (1 - WGS84_E2) + reference.height) * sinLatitude,
  ]
}

function enuToLlh(
  east: number,
  north: number,
  up: number,
  reference: RtkSolutionReference,
): RtkSolutionReference | null {
  const [x0, y0, z0] = llhToEcef(reference)
  const latitude = degreesToRadians(reference.latitude)
  const longitude = degreesToRadians(reference.longitude)
  const sinLatitude = Math.sin(latitude)
  const cosLatitude = Math.cos(latitude)
  const sinLongitude = Math.sin(longitude)
  const cosLongitude = Math.cos(longitude)
  const x =
    x0 - sinLongitude * east - sinLatitude * cosLongitude * north + cosLatitude * cosLongitude * up
  const y =
    y0 + cosLongitude * east - sinLatitude * sinLongitude * north + cosLatitude * sinLongitude * up
  const z = z0 + cosLatitude * north + sinLatitude * up
  return ecefToLlh(x, y, z)
}

function normalizeCalendarTime(date: string, time: string): string | null {
  const dateMatch = date.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/)
  const timeMatch = time.match(/^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/)
  if (!dateMatch || !timeMatch) return null
  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const second = Number(timeMatch[3])
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isFinite(second) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second >= 60
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${second.toFixed(3).padStart(6, '0')}`
}

function towToCalendarTime(week: number, tow: number): string | null {
  if (!Number.isInteger(week) || week < 0 || !Number.isFinite(tow) || tow < 0 || tow >= 604800) {
    return null
  }
  const date = new Date(GPS_EPOCH_MS + week * GPS_WEEK_MS + tow * 1000)
  if (!Number.isFinite(date.getTime())) return null
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = (date.getUTCSeconds() + date.getUTCMilliseconds() / 1000)
    .toFixed(3)
    .padStart(6, '0')
  return `${year}/${month}/${day} ${hour}:${minute}:${seconds}`
}

function parseReference(
  text: string,
  dms: boolean,
  format: RtkSolutionFormat,
): RtkSolutionReference | undefined {
  const values = splitFields(text)
    .map((value) => finite(value))
    .filter((value): value is number => value !== null)
  if (format === 'xyz' && values.length >= 3)
    return ecefToLlh(values[0], values[1], values[2]) ?? undefined
  if (values.length < (dms ? 7 : 3)) return undefined
  if (dms) {
    return {
      latitude: dmsToDegrees(values[0], values[1], values[2]),
      longitude: dmsToDegrees(values[3], values[4], values[5]),
      height: values[6],
    }
  }
  return { latitude: values[0], longitude: values[1], height: values[2] }
}

function updateStateFromHeader(line: string, state: RtkSolutionParserState): void {
  const text = line.trim()
  if (!text.startsWith('%') && !text.startsWith('+')) return
  if (/\bUTC\b/i.test(text)) state.timeSystem = 'utc'
  else if (/\bJST\b/i.test(text)) state.timeSystem = 'jst'
  else if (/\bGPST\b/i.test(text)) state.timeSystem = 'gpst'
  if (/latitude\(d'"\)/i.test(text)) {
    state.format = 'llh'
    state.dms = true
  } else if (/latitude\(deg\)/i.test(text)) {
    state.format = 'llh'
    state.dms = false
  } else if (/x-ecef\(m\)/i.test(text)) {
    state.format = 'xyz'
    state.dms = false
  } else if (/e-baseline\(m\)/i.test(text)) {
    state.format = 'enu'
    state.dms = false
  }
  const referenceMatch = text.match(/(?:ref|slave)\s+pos\s*:\s*(.*)$/i)
  if (referenceMatch) {
    const reference = parseReference(referenceMatch[1], state.dms, state.format)
    if (reference) state.reference = reference
  }
}

function parseTime(
  fields: string[],
  state: RtkSolutionParserState,
): { time: string; offset: number } | null {
  if (fields.length >= 2 && /^(\d{4})[/-]\d{2}[/-]\d{2}$/.test(fields[0])) {
    const time = normalizeCalendarTime(fields[0], fields[1])
    return time ? { time, offset: 2 } : null
  }
  if (fields.length >= 2 && state.timeFormat === 'tow') {
    const week = integer(fields[0])
    const tow = finite(fields[1])
    const time = week !== null && tow !== null ? towToCalendarTime(week, tow) : null
    return time ? { time, offset: 2 } : null
  }
  if (fields.length >= 2 && /^\d+$/.test(fields[0]) && /^\d+(?:\.\d+)?$/.test(fields[1])) {
    const week = integer(fields[0])
    const tow = finite(fields[1])
    const time = week !== null && tow !== null ? towToCalendarTime(week, tow) : null
    return time ? { time, offset: 2 } : null
  }
  return null
}

export class RtkSolutionParser {
  private readonly state: RtkSolutionParserState

  public constructor(options: RtkSolutionParserOptions = {}) {
    this.state = {
      format: options.format ?? 'llh',
      timeFormat: options.timeFormat ?? 'hms',
      timeSystem: options.timeSystem ?? 'gpst',
      dms: options.dms ?? false,
      reference: options.reference,
    }
  }

  public reset(): void {
    this.state.format = 'llh'
    this.state.timeFormat = 'hms'
    this.state.timeSystem = 'gpst'
    this.state.dms = false
    this.state.reference = undefined
  }

  public addLine(line: string): RtkSolution | null {
    const raw = line.trim()
    if (!raw) return null
    if (raw.startsWith('%') || raw.startsWith('+')) {
      updateStateFromHeader(raw, this.state)
      if (/\bGPST\b.*\b(?:latitude|x-ecef|e-baseline)/i.test(raw)) {
        this.state.timeFormat = 'hms'
      }
      return null
    }

    const fields = splitFields(raw)
    const parsedTime = parseTime(fields, this.state)
    if (!parsedTime) return null
    let index = parsedTime.offset
    const positionCount = this.state.format === 'llh' && this.state.dms ? 7 : 3
    if (fields.length < index + positionCount + 2) return null

    let position: RtkSolutionReference | null = null
    if (this.state.format === 'llh') {
      if (this.state.dms) {
        const values = fields.slice(index, index + 7).map((value) => finite(value))
        if (values.some((value) => value === null)) return null
        position = {
          latitude: dmsToDegrees(values[0] as number, values[1] as number, values[2] as number),
          longitude: dmsToDegrees(values[3] as number, values[4] as number, values[5] as number),
          height: values[6] as number,
        }
      } else {
        const latitude = finite(fields[index])
        const longitude = finite(fields[index + 1])
        const height = finite(fields[index + 2])
        if (latitude === null || longitude === null || height === null) return null
        position = { latitude, longitude, height }
      }
    } else if (this.state.format === 'xyz') {
      const x = finite(fields[index])
      const y = finite(fields[index + 1])
      const z = finite(fields[index + 2])
      if (x === null || y === null || z === null) return null
      position = ecefToLlh(x, y, z)
    } else {
      const east = finite(fields[index])
      const north = finite(fields[index + 1])
      const up = finite(fields[index + 2])
      if (east === null || north === null || up === null || !this.state.reference) return null
      position = enuToLlh(east, north, up, this.state.reference)
    }
    if (!position) return null
    index += positionCount

    const quality = integer(fields[index])
    const satellites = integer(fields[index + 1])
    if (quality === null || satellites === null || quality < 0 || quality > 9 || satellites < 0)
      return null
    index += 2

    const accuracy = [
      finite(fields[index]),
      finite(fields[index + 1]),
      finite(fields[index + 2]),
      finite(fields[index + 3]),
      finite(fields[index + 4]),
      finite(fields[index + 5]),
    ]
    const hasAccuracy = accuracy.some((value) => value !== null)
    if (fields.length >= index + 6) index += 6
    const age = finite(fields[index])
    const ratio = finite(fields[index + 1])

    return {
      time: parsedTime.time,
      latitude: position.latitude,
      longitude: position.longitude,
      height: position.height,
      quality,
      satellites,
      sdn: hasAccuracy ? accuracy[0] : null,
      sde: hasAccuracy ? accuracy[1] : null,
      sdu: hasAccuracy ? accuracy[2] : null,
      sdne: hasAccuracy ? accuracy[3] : null,
      sdeu: hasAccuracy ? accuracy[4] : null,
      sdun: hasAccuracy ? accuracy[5] : null,
      age,
      ratio,
      format: this.state.format,
      raw,
    }
  }
}

export function parseRtkSolutionLine(
  line: string,
  options: RtkSolutionParserOptions = {},
): RtkSolution | null {
  return new RtkSolutionParser(options).addLine(line)
}
