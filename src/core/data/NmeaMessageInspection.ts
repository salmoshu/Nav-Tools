import { calculateNmeaChecksum } from './NmeaStreamParser'
import type { MessageField, MessageInspection } from './MessageInspection'

type Column = string | readonly [label: string, unit: string]

const columns: Record<string, readonly Column[]> = {
  GGA: [
    'UTC time',
    'Latitude',
    'N/S',
    'Longitude',
    'E/W',
    'Fix quality',
    'Satellites used',
    'HDOP',
    'Altitude (MSL)',
    'Altitude unit',
    'Geoid separation',
    'Geoid unit',
    ['Differential age', 's'],
    'Reference station',
  ],
  GNS: [
    'UTC time',
    'Latitude',
    'N/S',
    'Longitude',
    'E/W',
    'Position mode',
    'Satellites used',
    'HDOP',
    ['Altitude (MSL)', 'm'],
    ['Geoid separation', 'm'],
    ['Differential age', 's'],
    'Reference station',
    'Navigation status',
  ],
  RMC: [
    'UTC time',
    'Data status',
    'Latitude',
    'N/S',
    'Longitude',
    'E/W',
    ['Speed over ground', 'kn'],
    ['True course', '°'],
    'UTC date (DDMMYY)',
    ['Magnetic variation', '°'],
    'E/W variation',
    'Position mode',
    'Navigation status',
  ],
  GLL: ['Latitude', 'N/S', 'Longitude', 'E/W', 'UTC time', 'Data status', 'Position mode'],
  GSA: [
    'Selection mode',
    'Fix dimension',
    ...Array.from({ length: 12 }, (_, i) => `Satellite ${i + 1}`),
    'PDOP',
    'HDOP',
    'VDOP',
    'GNSS system ID',
  ],
  GSV: ['Sentences in group', 'Sentence number', 'Satellites in view'],
  VTG: [
    ['True course', '°'],
    'True course marker',
    ['Magnetic course', '°'],
    'Magnetic course marker',
    ['Speed over ground', 'kn'],
    'Knots marker',
    ['Speed over ground', 'km/h'],
    'km/h marker',
    'Position mode',
  ],
  GST: [
    'UTC time',
    ['Range RMS', 'm'],
    ['Semi-major error', 'm'],
    ['Semi-minor error', 'm'],
    ['Error ellipse orientation', '°'],
    ['Latitude standard deviation', 'm'],
    ['Longitude standard deviation', 'm'],
    ['Height standard deviation', 'm'],
  ],
  GBS: [
    'UTC time',
    ['Latitude error', 'm'],
    ['Longitude error', 'm'],
    ['Height error', 'm'],
    'Failed satellite',
    'Missed detection probability',
    ['Bias estimate', 'm'],
    ['Bias standard deviation', 'm'],
    'GNSS system ID',
    'Signal ID',
  ],
  ZDA: [
    'UTC time',
    'Day',
    'Month',
    'Year',
    ['Local zone hours', 'h'],
    ['Local zone minutes', 'min'],
  ],
  TXT: ['Sentences in group', 'Sentence number', 'Message identifier', 'Text'],
  HDT: [['True heading', '°'], 'True heading marker'],
  HDM: [['Magnetic heading', '°'], 'Magnetic heading marker'],
  HDG: [
    ['Magnetic heading', '°'],
    ['Magnetic deviation', '°'],
    'E/W deviation',
    ['Magnetic variation', '°'],
    'E/W variation',
  ],
  'PUBX,00': [
    'Subtype',
    'UTC time',
    'Latitude',
    'N/S',
    'Longitude',
    'E/W',
    ['Ellipsoid height', 'm'],
    'Navigation status',
    ['Horizontal accuracy', 'm'],
    ['Vertical accuracy', 'm'],
    ['Speed over ground', 'km/h'],
    ['True course', '°'],
    ['Downward velocity', 'm/s'],
    ['Differential age', 's'],
    'HDOP',
    'VDOP',
    'TDOP',
    'Satellites used',
    'Reserved',
    'Dead reckoning',
  ],
  'PUBX,03': ['Subtype', 'Satellites tracked'],
  'PUBX,04': [
    'Subtype',
    'UTC time',
    'UTC date (DDMMYY)',
    ['UTC time of week', 's'],
    'UTC week',
    ['Leap seconds', 's'],
    ['Clock bias', 'ns'],
    ['Clock drift', 'ns/s'],
    ['Time pulse granularity', 'ns'],
  ],
}

const names: Record<string, string> = {
  GGA: 'Position fix',
  GNS: 'Multi-GNSS fix',
  RMC: 'Position and motion',
  GLL: 'Geographic position',
  GSA: 'Satellites used and DOP',
  GSV: 'Satellites in view',
  VTG: 'Course and speed',
  GST: 'Position error statistics',
  GBS: 'Satellite fault detection',
  ZDA: 'Time and date',
  TXT: 'Receiver text',
  HDT: 'True heading',
  HDM: 'Magnetic heading',
  HDG: 'Heading, deviation and variation',
  'PUBX,00': 'Receiver position',
  'PUBX,03': 'Satellite status',
  'PUBX,04': 'Receiver time and clock',
}

// Vendor fields follow u-blox F9 TIM 2.20 interface description, PUBX output.
function nmeaType(identifier: string, subtype?: string): string {
  if (identifier === 'PUBX' && /^\d{2}$/.test(subtype ?? '')) return `PUBX,${subtype}`
  return identifier.startsWith('P') ? identifier : identifier.slice(2) || identifier
}

export function identifyNmeaMessage(
  text: string,
): { code: string; group: 'standard' | 'pubx' | 'proprietary'; title: string } | null {
  const match = /[$!]([A-Z0-9]{3,20})(?=[,*])(?:,(\d{2})(?=[,*]))?/i.exec(text)
  if (!match) return null
  const identifier = match[1].toUpperCase()
  const code = nmeaType(identifier, match[2])
  return {
    code: identifier === 'PUBX' ? code.replace(/^PUBX,/, '') : code,
    group: identifier === 'PUBX' ? 'pubx' : identifier.startsWith('P') ? 'proprietary' : 'standard',
    title: names[code] ?? 'NMEA sentence',
  }
}

const talkers: Record<string, string> = {
  GP: 'GPS',
  GL: 'GLONASS',
  GA: 'Galileo',
  GB: 'BeiDou',
  BD: 'BeiDou',
  GQ: 'QZSS',
  QZ: 'QZSS',
  GI: 'NavIC',
  GN: 'Multi-GNSS',
}

const fixQuality: Record<string, string> = {
  '0': 'Invalid',
  '1': 'Single',
  '2': 'DGNSS',
  '3': 'PPS',
  '4': 'RTK Fix',
  '5': 'RTK Float',
  '6': 'Estimated',
  '7': 'Manual',
  '8': 'Simulation',
}
const positionModes: Record<string, string> = {
  A: 'Autonomous',
  D: 'Differential',
  E: 'Estimated',
  F: 'RTK Float',
  M: 'Manual',
  N: 'Invalid',
  P: 'Precise',
  R: 'RTK Fix',
  S: 'Simulation',
}
const gnssSystems: Record<string, string> = {
  '1': 'GPS',
  '2': 'GLONASS',
  '3': 'Galileo',
  '4': 'BeiDou',
  '5': 'QZSS',
  '6': 'NavIC',
}

function labelValue(description: string | undefined, value: string): string {
  return description ? `${description} (${value})` : value
}

function coordinate(value: string, hemisphere: string, latitude: boolean): string {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return value
  if (!(latitude ? /^[NS]$/i : /^[EW]$/i).test(hemisphere)) return value
  const number = Number(value)
  const degrees = Math.floor(number / 100)
  const minutes = number - degrees * 100
  const magnitude = degrees + minutes / 60
  if (minutes >= 60 || magnitude > (latitude ? 90 : 180)) return value
  const decimal = magnitude * (/^[SW]$/i.test(hemisphere) ? -1 : 1)
  return `${decimal.toFixed(8)}° (${value} ${hemisphere})`
}

function decorate(label: string, value: string, next: string): string {
  if (!value) return ''
  if (label === 'Latitude' || label === 'Longitude')
    return coordinate(value, next, label === 'Latitude')
  if (label === 'UTC time' && /^\d{6}(?:\.\d+)?$/.test(value))
    return `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4)}`
  if (label === 'Fix quality') return labelValue(fixQuality[value], value)
  if (label === 'Position mode' && value.length === 1)
    return labelValue(positionModes[value], value)
  if (label === 'Data status')
    return labelValue(value === 'A' ? 'Active' : value === 'V' ? 'Void' : undefined, value)
  if (label === 'Selection mode')
    return labelValue(value === 'A' ? 'Automatic' : value === 'M' ? 'Manual' : undefined, value)
  if (label === 'Fix dimension')
    return labelValue(
      ({ '1': 'No fix', '2': '2D', '3': '3D' } as Record<string, string>)[value],
      value,
    )
  if (label === 'GNSS system ID') return labelValue(gnssSystems[value], value)
  return value
}

export function inspectNmeaMessage(text: string): MessageInspection | null {
  const match = /[$!]([A-Z0-9]+)(,?[^*\r\n]*)(?:\*([^\r\n]*))?/i.exec(text)
  if (!match) return null
  const [, identifier, CSV, checksum] = match
  const id = identifier.toUpperCase()
  const talker = id.startsWith('P') ? id.slice(0, 4) : id.slice(0, 2)
  const cells = CSV.startsWith(',') ? CSV.slice(1).split(',') : []
  const type = nmeaType(id, cells[0])
  const schema = columns[type] ?? []
  const expected = calculateNmeaChecksum(match[0])
  const suppliedChecksum = checksum?.trim().toUpperCase()
  const integrity =
    checksum !== undefined ? (expected === suppliedChecksum ? 'valid' : 'invalid') : 'unchecked'
  const fields: MessageField[] = [
    { label: 'Talker', value: talkers[talker] ? `${talkers[talker]} (${talker})` : talker },
  ]
  const result: MessageInspection = {
    code: id === 'PUBX' && type !== id ? type : id,
    title: names[type] ?? 'NMEA sentence',
    summary: names[type] ?? 'NMEA sentence',
    integrity,
    fields,
    note: schema.length ? undefined : 'unknown',
  }

  const count =
    type === 'GSV'
      ? Math.min(3, cells.length)
      : type === 'PUBX,03'
        ? Math.min(2, cells.length)
        : cells.length
  for (let i = 0; i < count; i++) {
    const column = schema[i] ?? `Field ${i + 1}`
    const [label, unit] = typeof column === 'string' ? [column, undefined] : column
    fields.push({ label, value: decorate(label, cells[i], cells[i + 1] ?? ''), unit })
  }

  if (type === 'GSV') {
    const remaining = cells.length - 3
    const hasSignal = remaining >= 1 && remaining % 4 === 1
    const end = hasSignal ? cells.length - 1 : cells.length
    if (hasSignal) fields.push({ label: 'Signal ID', value: cells[end] })
    const rows: string[][] = []
    for (let i = 3; i + 3 < end; i += 4) rows.push(cells.slice(i, i + 4))
    if (rows.length)
      result.tables = [
        {
          label: 'Satellite observations',
          columns: ['Satellite', 'Elevation (°)', 'Azimuth (°)', 'C/N0 (dB-Hz)'],
          rows,
        },
      ]
    if (remaining < 0 || (end - 3) % 4 !== 0) result.note = 'truncated'
    result.summary = [
      cells[2] ? `${cells[2]} SV` : '',
      cells[1] && cells[0] ? `${cells[1]}/${cells[0]}` : '',
      talkers[talker],
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (type === 'PUBX,03' && cells.length > 1) {
    const rows: string[][] = []
    for (let i = 2; i + 5 < cells.length; i += 6) {
      const row = cells.slice(i, i + 6)
      row[1] = labelValue(
        ({ U: 'Used', e: 'Ephemeris available', '-': 'Not used' } as Record<string, string>)[
          row[1]
        ],
        row[1],
      )
      rows.push(row)
    }
    if (rows.length)
      result.tables = [
        {
          label: 'Satellite observations',
          columns: [
            'Satellite',
            'Status',
            'Azimuth (°)',
            'Elevation (°)',
            'C/N0 (dB-Hz)',
            'Lock time (s)',
          ],
          rows,
        },
      ]
    if (rows.length !== Number(cells[1])) result.note = 'truncated'
    result.summary = `${cells[1]} SV · ${result.title}`
  } else if (type === 'GGA' || type === 'GNS') {
    const quality = type === 'GGA' ? (fixQuality[cells[5]] ?? cells[5]) : cells[5]
    result.summary = [
      quality,
      cells[6] ? `${cells[6]} SV` : '',
      decorate('UTC time', cells[0] ?? '', ''),
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (type === 'RMC') {
    result.summary = [
      decorate('Data status', cells[1] ?? '', ''),
      cells[6] ? `${cells[6]} kn` : '',
      cells[7] ? `${cells[7]}°` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (type === 'GSA') {
    const satellites = cells.slice(2, 14).filter(Boolean)
    result.summary = [
      decorate('Fix dimension', cells[1] ?? '', ''),
      `${satellites.length} SV`,
      cells[14] ? `PDOP ${cells[14]}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (type === 'TXT') {
    result.summary = cells[3] ?? result.title
  }

  if (checksum !== undefined) {
    fields.push({
      label: 'Checksum',
      value: integrity === 'valid' ? `0x${expected}` : `${suppliedChecksum || '—'} ≠ ${expected}`,
    })
  }
  return result
}
