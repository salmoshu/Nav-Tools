import { crc24q } from '../gnssraw/RtcmFileAccess'
import type { MessageInspection } from './MessageInspection'

const RANGE_PER_MS = 299792.458
const titles: Record<number, string> = {
  1005: 'Reference station coordinates',
  1006: 'Reference station and antenna height',
  1007: 'Antenna descriptor',
  1008: 'Antenna descriptor and serial number',
  1013: 'System parameters',
  1019: 'GPS ephemeris',
  1020: 'GLONASS ephemeris',
  1029: 'Unicode text',
  1033: 'Receiver and antenna descriptors',
  1041: 'NavIC ephemeris',
  1042: 'BeiDou ephemeris',
  1044: 'QZSS ephemeris',
  1045: 'Galileo F/NAV ephemeris',
  1046: 'Galileo I/NAV ephemeris',
  1230: 'GLONASS code-phase biases',
}

interface MsmSystem {
  name: string
  prefix: string
  signalCodes: Record<number, string>
}
const msmSystems: Record<number, MsmSystem> = {
  107: {
    name: 'GPS',
    prefix: 'G',
    signalCodes: {
      2: '1C',
      3: '1P',
      4: '1W',
      8: '2C',
      9: '2P',
      10: '2W',
      15: '2S',
      16: '2L',
      17: '2X',
      22: '5I',
      23: '5Q',
      24: '5X',
      30: '1S',
      31: '1L',
      32: '1X',
    },
  },
  108: {
    name: 'GLONASS',
    prefix: 'R',
    signalCodes: {
      2: '1C',
      3: '1P',
      8: '2C',
      9: '2P',
      14: '3I',
      15: '3Q',
      16: '3X',
      18: '4A',
      19: '4B',
      20: '4X',
      22: '6A',
      23: '6B',
      24: '6X',
    },
  },
  109: {
    name: 'Galileo',
    prefix: 'E',
    signalCodes: {
      2: '1C',
      3: '1A',
      4: '1B',
      5: '1X',
      6: '1Z',
      8: '6C',
      9: '6A',
      10: '6B',
      11: '6X',
      12: '6Z',
      14: '7I',
      15: '7Q',
      16: '7X',
      18: '8I',
      19: '8Q',
      20: '8X',
      22: '5I',
      23: '5Q',
      24: '5X',
    },
  },
  110: { name: 'SBAS', prefix: 'S', signalCodes: { 2: '1C', 22: '5I', 23: '5Q', 24: '5X' } },
  111: {
    name: 'QZSS',
    prefix: 'J',
    signalCodes: {
      2: '1C',
      3: '1E',
      5: '1E',
      6: '1Z',
      7: '1B',
      9: '6S',
      10: '6L',
      11: '6X',
      12: '6E',
      13: '6Z',
      15: '2S',
      16: '2L',
      17: '2X',
      22: '5I',
      23: '5Q',
      24: '5X',
      25: '5D',
      26: '5P',
      27: '5Z',
      30: '1S',
      31: '1L',
      32: '1X',
    },
  },
  112: {
    name: 'BeiDou',
    prefix: 'C',
    signalCodes: {
      2: '2I',
      3: '2Q',
      4: '2X',
      5: '1S',
      6: '1L',
      7: '1Z',
      8: '6I',
      9: '6Q',
      10: '6X',
      11: '6D',
      12: '6P',
      13: '6Z',
      14: '7I',
      15: '7Q',
      16: '7X',
      18: '8D',
      19: '8P',
      20: '8X',
      22: '5D',
      23: '5P',
      24: '5X',
      25: '7D',
      26: '7P',
      27: '7Z',
      30: '1D',
      31: '1P',
      32: '1X',
    },
  },
  113: {
    name: 'NavIC',
    prefix: 'I',
    signalCodes: {
      2: '1D',
      3: '1P',
      4: '1X',
      8: '9A',
      9: '9B',
      10: '9C',
      11: '9X',
      22: '5A',
      23: '5B',
      24: '5C',
      25: '5X',
    },
  },
}

export function identifyRtcmMessage(
  hex: string,
): {
  code: string
  group: 'station' | 'observations' | 'ephemeris' | 'corrections' | 'proprietary' | 'other'
  title: string
} | null {
  const header = hex.slice(0, 20).replace(/\s/g, '')
  if (!/^d30[0-3][0-9a-f]{5}/i.test(header)) return null
  const type = Number.parseInt(header.slice(6, 9), 16)
  const system = msmSystems[Math.floor(type / 10)]
  const subtype = type % 10
  if (system && subtype >= 1 && subtype <= 7)
    return { code: String(type), group: 'observations', title: `${system.name} MSM${subtype}` }
  let group: NonNullable<ReturnType<typeof identifyRtcmMessage>>['group'] = 'other'
  let title = titles[type] ?? 'RTCM3 message'
  if ((type >= 1001 && type <= 1004) || (type >= 1009 && type <= 1012)) {
    group = 'observations'
    title = type >= 1009 ? 'GLONASS observations' : 'GPS observations'
  } else if ([1005, 1006, 1007, 1008, 1013, 1033].includes(type)) group = 'station'
  else if ([1019, 1020, 1041, 1042, 1044, 1045, 1046].includes(type)) group = 'ephemeris'
  else if ((1057 <= type && type <= 1068) || type === 1230 || (1240 <= type && type <= 1270)) {
    group = 'corrections'
    if (type !== 1230) title = 'State-space correction'
  } else if (type >= 4001) {
    group = 'proprietary'
    title = 'Proprietary RTCM3 message'
  }
  return { code: String(type), group, title }
}

class Bits {
  private offset = 0

  constructor(private readonly bytes: Uint8Array) {}

  u(n: number): number {
    if (this.offset + n > this.bytes.length * 8) throw new RangeError('Incomplete payload')
    let value = 0
    for (let i = 0; i < n; i++, this.offset++) {
      value = value * 2 + ((this.bytes[this.offset >>> 3] >>> (7 - (this.offset & 7))) & 1)
    }
    return value
  }

  s(n: number): number {
    const value = this.u(n)
    return value >= 2 ** (n - 1) ? value - 2 ** n : value
  }

  array(length: number, width: number, signed = false): number[] {
    return Array.from({ length }, () => (signed ? this.s(width) : this.u(width)))
  }

  text(n = this.u(8)): string {
    return new TextDecoder().decode(Uint8Array.from(this.array(n, 8)))
  }
}

type AddField = (label: string, value: string | number, unit?: string) => void

function satellite(prefix: string, id: number): string {
  return `${prefix}${String(id).padStart(2, '0')}`
}

function measurement(value: number | null, decimals: number): string {
  return value === null ? '' : value.toFixed(decimals)
}

function describeMsm(
  bits: Bits,
  system: MsmSystem,
  subtype: number,
  result: MessageInspection,
  add: AddField,
  details: boolean,
): void {
  const station = bits.u(12)
  const glonass = system.prefix === 'R'
  add('Station ID', station)
  if (glonass) add('GLONASS day of week', bits.u(3))
  add(
    glonass
      ? 'Epoch (GLONASS day)'
      : system.prefix === 'C'
        ? 'Epoch (BeiDou week)'
        : 'Epoch (week)',
    (bits.u(glonass ? 27 : 30) / 1000).toFixed(3),
    's',
  )
  add('Multiple-message flag', bits.u(1))
  add('Station data issue', bits.u(3))
  bits.u(7)
  add('Clock steering', bits.u(2))
  add('External clock', bits.u(2))
  add('Divergence-free smoothing', bits.u(1))
  add('Smoothing interval code', bits.u(3))

  const satellites = bits.array(64, 1).flatMap((set, i) => (set ? [i + 1] : []))
  const signals = bits.array(32, 1).flatMap((set, i) => (set ? [i + 1] : []))
  const cells: [number, number][] = []
  for (let s = 0; s < satellites.length; s++)
    for (const signal of signals) if (bits.u(1)) cells.push([s, signal])

  const id = (index: number) =>
    satellite(system.prefix, satellites[index] + (system.prefix === 'S' ? 119 : 0))
  const signal = (index: number) => system.signalCodes[index] ?? `ID ${index}`
  add('Satellites', satellites.length)
  add('Signal types', signals.map((index) => `${signal(index)} [${index}]`).join(', '))
  add('Observation cells', cells.length)
  result.summary = `${system.name} MSM${subtype} · Sta ${station} · ${satellites.length} SV · ${cells.length} obs`
  if (subtype < 4) result.note = 'header-only'
  if (!details || cells.length === 0) return
  if (subtype < 4) {
    result.tables = [
      {
        label: 'Observation mask',
        columns: ['Satellite', 'Signal'],
        rows: cells.map(([index, type]) => [id(index), signal(type)]),
      },
    ]
    return
  }

  const n = satellites.length
  const k = cells.length
  const highResolution = subtype >= 6
  const hasRate = subtype === 5 || subtype === 7
  const wholeMs = bits.array(n, 8)
  const extended = hasRate ? bits.array(n, 4) : []
  const fraction = bits.array(n, 10)
  const roughRate = hasRate ? bits.array(n, 14, true) : []
  const prWidth = highResolution ? 20 : 15
  const phaseWidth = highResolution ? 24 : 22
  const fineRange = bits.array(k, prWidth, true)
  const finePhase = bits.array(k, phaseWidth, true)
  const lock = bits.array(k, highResolution ? 10 : 4)
  const half = bits.array(k, 1)
  const cnr = bits.array(k, highResolution ? 10 : 6)
  const fineRate = hasRate ? bits.array(k, 15, true) : []
  result.tables = [
    {
      label: 'Signal measurements',
      columns: [
        'Satellite',
        'Signal',
        'C/N0 (dB-Hz)',
        'Pseudorange (m)',
        'Phase range (m)',
        ...(hasRate ? ['Range rate (m/s)'] : []),
        'Lock code',
        'Half-cycle ambiguity',
        ...(hasRate && glonass ? ['Frequency channel'] : []),
      ],
      rows: cells.map(([s, type], i) => {
        const rough = wholeMs[s] === 255 ? null : (wholeMs[s] + fraction[s] / 1024) * RANGE_PER_MS
        const pr =
          rough === null || fineRange[i] === -(2 ** (prWidth - 1))
            ? null
            : rough + fineRange[i] * 2 ** (highResolution ? -29 : -24) * RANGE_PER_MS
        const phase =
          rough === null || finePhase[i] === -(2 ** (phaseWidth - 1))
            ? null
            : rough + finePhase[i] * 2 ** (highResolution ? -31 : -29) * RANGE_PER_MS
        const rate =
          hasRate && roughRate[s] !== -8192 && fineRate[i] !== -16384
            ? roughRate[s] + fineRate[i] * 0.0001
            : null
        return [
          id(s),
          signal(type),
          measurement(cnr[i] * (highResolution ? 0.0625 : 1), highResolution ? 2 : 0),
          measurement(pr, 3),
          measurement(phase, 4),
          ...(hasRate ? [measurement(rate, 4)] : []),
          String(lock[i]),
          String(half[i]),
          ...(hasRate && glonass ? [extended[s] <= 13 ? String(extended[s] - 7) : ''] : []),
        ]
      }),
    },
  ]
}

function describeLegacyObservations(
  bits: Bits,
  type: number,
  result: MessageInspection,
  add: AddField,
  details: boolean,
): void {
  const glonass = type >= 1009
  const dual = type === 1003 || type === 1004 || type === 1011 || type === 1012
  const extended = type % 2 === 0
  const station = bits.u(12)
  const epoch = bits.u(glonass ? 27 : 30) / 1000
  const multiple = bits.u(1)
  const count = bits.u(5)
  add('Station ID', station)
  add(glonass ? 'Epoch (GLONASS day)' : 'Epoch (week)', epoch.toFixed(3), 's')
  add('Multiple-message flag', multiple)
  add('Satellites', count)
  add('Divergence-free smoothing', bits.u(1))
  add('Smoothing interval code', bits.u(3))
  result.title = `${glonass ? 'GLONASS' : 'GPS'} L1${dual ? '/L2' : ''} observations`
  result.summary = `${result.title} · Sta ${station} · ${count} SV`
  if (!details || count === 0) return
  const rows: string[][] = []
  for (let i = 0; i < count; i++) {
    const prn = bits.u(6)
    const id = glonass
      ? satellite('R', prn)
      : prn >= 40
        ? satellite('S', prn + 80)
        : satellite('G', prn)
    const l1 = bits.u(1) ? '1P' : '1C'
    const channel = glonass ? String(bits.u(5) - 7) : ''
    const moduloRange = bits.u(glonass ? 25 : 24) * 0.02
    const phase1 = bits.s(20)
    const lock1 = bits.u(7)
    const base =
      moduloRange + (extended ? bits.u(glonass ? 7 : 8) * RANGE_PER_MS * (glonass ? 2 : 1) : 0)
    const cnr1 = extended ? bits.u(8) * 0.25 : null
    rows.push([
      id,
      l1,
      measurement(cnr1, 2),
      base.toFixed(2),
      measurement(phase1 === -524288 ? null : base + phase1 * 0.0005, 4),
      String(lock1),
      ...(glonass ? [channel] : []),
    ])
    if (!dual) continue
    const l2 = bits.u(2)
    const range2 = bits.s(14)
    const phase2 = bits.s(20)
    const lock2 = bits.u(7)
    const cnr2 = extended ? bits.u(8) * 0.25 : null
    const signal = glonass ? ['2C', '2P', 'ID 2', 'ID 3'][l2] : ['2X', '2P', '2D', '2W'][l2]
    rows.push([
      id,
      signal,
      measurement(cnr2, 2),
      measurement(range2 === -8192 ? null : base + range2 * 0.02, 2),
      measurement(phase2 === -524288 ? null : base + phase2 * 0.0005, 4),
      String(lock2),
      ...(glonass ? [channel] : []),
    ])
  }
  result.tables = [
    {
      label: 'Signal measurements',
      columns: [
        'Satellite',
        'Signal',
        'C/N0 (dB-Hz)',
        extended ? 'Pseudorange (m)' : 'Modulo pseudorange (m)',
        extended ? 'Phase range (m)' : 'Modulo phase range (m)',
        'Lock code',
        ...(glonass ? ['Frequency channel'] : []),
      ],
      rows,
    },
  ]
}

function describeGpsEphemeris(
  bits: Bits,
  result: MessageInspection,
  add: AddField,
  details: boolean,
): void {
  const prn = bits.u(6)
  const week = bits.u(10)
  const id = prn >= 40 ? satellite('S', prn + 80) : satellite('G', prn)
  add('Satellite', id)
  add('Broadcast week (mod 1024)', week)
  result.summary = `${result.title} · ${id} · W${week}`
  if (!details) return
  add('URA index', bits.u(4))
  add('L2 code', bits.u(2))
  add('Inclination rate', (bits.s(14) * 2 ** -43).toExponential(8), 'semicircles/s')
  add('IODE', bits.u(8))
  add('Clock epoch (Toc)', bits.u(16) * 16, 's')
  add('Clock drift rate (af2)', (bits.s(8) * 2 ** -55).toExponential(8), 's/s²')
  add('Clock drift (af1)', (bits.s(16) * 2 ** -43).toExponential(8), 's/s')
  add('Clock bias (af0)', (bits.s(22) * 2 ** -31).toExponential(8), 's')
  add('IODC', bits.u(10))
  const parameters: readonly [string, number, boolean, number, string?][] = [
    ['Crs', 16, true, 2 ** -5, 'm'],
    ['Mean motion difference', 16, true, 2 ** -43, 'semicircles/s'],
    ['Mean anomaly', 32, true, 2 ** -31, 'semicircles'],
    ['Cuc', 16, true, 2 ** -29, 'rad'],
    ['Eccentricity', 32, false, 2 ** -33],
    ['Cus', 16, true, 2 ** -29, 'rad'],
    ['Square root of semi-major axis', 32, false, 2 ** -19, 'm½'],
    ['Ephemeris epoch (Toe)', 16, false, 16, 's'],
    ['Cic', 16, true, 2 ** -29, 'rad'],
    ['Right ascension', 32, true, 2 ** -31, 'semicircles'],
    ['Cis', 16, true, 2 ** -29, 'rad'],
    ['Inclination', 32, true, 2 ** -31, 'semicircles'],
    ['Crc', 16, true, 2 ** -5, 'm'],
    ['Argument of perigee', 32, true, 2 ** -31, 'semicircles'],
    ['Right ascension rate', 24, true, 2 ** -43, 'semicircles/s'],
    ['Group delay', 8, true, 2 ** -31, 's'],
  ]
  for (const [label, n, signed, scale, unit] of parameters) {
    const value = (signed ? bits.s(n) : bits.u(n)) * scale
    add(label, unit === 's' && scale === 16 ? value : Number(value.toPrecision(11)), unit)
  }
  add('Satellite health', bits.u(6))
  add('L2 P data flag', bits.u(1))
  add('Fit interval flag', bits.u(1))
}

export function inspectRtcmMessage(hex: string, details = true): MessageInspection {
  const compact = hex.replace(/\s/g, '')
  const bytes =
    compact.length <= 2058 && compact.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(compact)
      ? Uint8Array.from(compact.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16))
      : new Uint8Array()
  const result: MessageInspection = {
    code: 'RTCM3',
    title: 'Unframed RTCM3 bytes',
    summary: '',
    fields: [],
    integrity: 'invalid',
    note: 'unframed',
  }
  if (bytes.length < 6 || bytes[0] !== 0xd3 || (bytes[1] & 0xfc) !== 0) return result
  const size = ((bytes[1] & 3) << 8) | bytes[2]
  if (bytes.length !== size + 6 || size < 2) return result
  const end = bytes.length - 3
  const checksum = bytes[end] * 65536 + bytes[end + 1] * 256 + bytes[end + 2]
  const expected = crc24q(bytes, 0, end)
  const bits = new Bits(bytes.subarray(3, end))
  const type = bits.u(12)
  const system = msmSystems[Math.floor(type / 10)]
  const subtype = type % 10
  const hexCrc = (value: number) => `0x${value.toString(16).padStart(6, '0').toUpperCase()}`
  const add: AddField = (label, value, unit) =>
    result.fields.push({ label, value: String(value), unit })
  result.code = String(type)
  result.title =
    system && subtype >= 1 && subtype <= 7
      ? `${system.name} MSM${subtype}`
      : (titles[type] ?? (type >= 4001 ? 'Proprietary RTCM3 message' : 'RTCM3 message'))
  result.summary = result.title
  result.integrity = checksum === expected ? 'valid' : 'invalid'
  result.note = undefined
  add('Message type', type)
  add('Payload size', size, 'B')
  add(
    'CRC24Q',
    checksum === expected ? hexCrc(checksum) : `${hexCrc(checksum)} ≠ ${hexCrc(expected)}`,
  )
  if (checksum !== expected) return result

  try {
    if (system && subtype >= 1 && subtype <= 7) {
      describeMsm(bits, system, subtype, result, add, details)
    } else if ((type >= 1001 && type <= 1004) || (type >= 1009 && type <= 1012)) {
      describeLegacyObservations(bits, type, result, add, details)
    } else if (type === 1005 || type === 1006) {
      const id = bits.u(12)
      add('Station ID', id)
      add('ITRF realization', bits.u(6))
      add('GPS indicator', bits.u(1))
      add('GLONASS indicator', bits.u(1))
      add('Galileo indicator', bits.u(1))
      add('Reference station indicator', bits.u(1))
      add('ECEF X', (bits.s(38) * 0.0001).toFixed(4), 'm')
      add('Single receiver oscillator', bits.u(1))
      bits.u(1)
      add('ECEF Y', (bits.s(38) * 0.0001).toFixed(4), 'm')
      add('Quarter-cycle indicator', bits.u(2))
      add('ECEF Z', (bits.s(38) * 0.0001).toFixed(4), 'm')
      if (type === 1006) add('Antenna height', (bits.u(16) * 0.0001).toFixed(4), 'm')
      result.summary += ` · Sta ${id}`
    } else if ([1007, 1008, 1033].includes(type)) {
      const id = bits.u(12)
      add('Station ID', id)
      add('Antenna descriptor', bits.text())
      add('Antenna setup ID', bits.u(8))
      if (type !== 1007) add('Antenna serial number', bits.text())
      if (type === 1033) {
        add('Receiver model', bits.text())
        add('Receiver firmware', bits.text())
        add('Receiver serial number', bits.text())
      }
      result.summary += ` · Sta ${id}`
    } else if (type === 1013 || type === 1029) {
      const id = bits.u(12)
      add('Station ID', id)
      add('Modified Julian date', bits.u(16))
      add('UTC seconds of day', bits.u(17), 's')
      if (type === 1013) {
        const count = bits.u(5)
        add('Announced messages', count)
        add('Leap seconds', bits.u(8), 's')
        if (count && details)
          result.tables = [
            {
              label: 'Message schedule',
              columns: ['Message type', 'Synchronous flag', 'Interval (s)'],
              rows: Array.from({ length: count }, () => [
                String(bits.u(12)),
                String(bits.u(1)),
                (bits.u(16) / 10).toFixed(1),
              ]),
            },
          ]
      } else {
        add('Unicode characters', bits.u(7))
        add('Text', bits.text())
      }
      result.summary += ` · Sta ${id}`
    } else if (type === 1230) {
      const id = bits.u(12)
      add('Station ID', id)
      add('Code-phase alignment', bits.u(1))
      bits.u(3)
      const mask = bits.u(4)
      for (const [index, band] of ['L1 C/A', 'L1 P', 'L2 C/A', 'L2 P'].entries()) {
        if (!(mask & (8 >> index))) continue
        const value = bits.s(16)
        add(band, measurement(value === -32768 ? null : value * 0.02, 2), 'm')
      }
      result.summary += ` · Sta ${id}`
    } else if (type === 1019) {
      describeGpsEphemeris(bits, result, add, details)
    } else if ([1020, 1042, 1044, 1045, 1046].includes(type)) {
      const prefix = type === 1020 ? 'R' : type === 1042 ? 'C' : type === 1044 ? 'J' : 'E'
      const id = satellite(prefix, bits.u(type === 1044 ? 4 : 6))
      add('Satellite', id)
      if (type === 1020) add('Frequency channel', bits.u(5) - 7)
      if ([1042, 1045, 1046].includes(type)) add('Broadcast week', bits.u(type === 1042 ? 13 : 12))
      result.summary += ` · ${id}`
      result.note = 'header-only'
    } else {
      result.note = 'unknown'
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    result.note = 'truncated'
  }
  return result
}
