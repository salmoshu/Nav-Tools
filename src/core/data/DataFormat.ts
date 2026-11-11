import { detectGnssTextParser } from './GnssTextFormat'
import { splitCsvLine } from './TextRecordParser'
import { validateNmeaChecksum } from './NmeaStreamParser'
import { isRnxFileName, isRtcmFileName, sniffRnx, sniffRtcm } from '@/core/gnssraw/RtcmFileAccess'

export const DETECTABLE_FORMATS = [
  'rtcm3',
  'rinex',
  'nmea',
  'rtklib-pos',
  'json',
  'csv',
  'mcap',
] as const
export type DetectableFormat = (typeof DETECTABLE_FORMATS)[number]
export type DataFormat = 'auto' | 'raw' | 'regex' | DetectableFormat

export const FORMAT_LABELS: Record<DataFormat, string> = {
  auto: 'Auto',
  raw: 'Raw',
  regex: 'Regex',
  rtcm3: 'RTCM3',
  rinex: 'RINEX',
  nmea: 'NMEA',
  'rtklib-pos': 'RTKLIB POS',
  json: 'JSON',
  csv: 'CSV',
  mcap: 'MCAP',
}

export function isDataFormat(value: unknown): value is DataFormat {
  return (
    value === 'auto' ||
    value === 'raw' ||
    value === 'regex' ||
    (typeof value === 'string' && (DETECTABLE_FORMATS as readonly string[]).includes(value))
  )
}

export function isTextFormat(
  value: DataFormat,
): value is 'raw' | 'regex' | 'nmea' | 'rtklib-pos' | 'json' | 'csv' {
  return ['raw', 'regex', 'nmea', 'rtklib-pos', 'json', 'csv'].includes(value)
}

export interface FormatDetection {
  format: DetectableFormat
  evidence: 'content' | 'extension'
  candidate?: boolean
  disabled?: boolean
}

/** Detect from bounded bytes before consulting the filename. Disabled formats never match. */
export function detectDataFormat(
  bytes: Uint8Array,
  name: string,
  enabled: readonly DetectableFormat[],
): FormatDetection | undefined {
  const has = (format: DetectableFormat) => enabled.includes(format)
  const found = (
    format: DetectableFormat,
    evidence: FormatDetection['evidence'] = 'content',
  ): FormatDetection => ({ format, evidence })
  const magic = [0x89, 0x4d, 0x43, 0x41, 0x50, 0x30, 0x0d, 0x0a]
  if (bytes.length >= magic.length && magic.every((value, i) => bytes[i] === value))
    return has('mcap') ? found('mcap') : undefined
  if (sniffRtcm(bytes, bytes.length)) return has('rtcm3') ? found('rtcm3') : undefined
  if (sniffRnx(bytes)) return has('rinex') ? found('rinex') : undefined

  // Do not interpret a binary payload as a text format.
  const textBytes = bytes.subarray(0, Math.min(bytes.length, 64 * 1024))
  const binary = textBytes.some((b) => b === 0 || b < 0x09 || (b > 0x0d && b < 0x20))
  if (!binary) {
    const text = new TextDecoder().decode(textBytes)
    const gnss = detectGnssTextParser(text)
    if (gnss === 'nmea') {
      const lines = text.split(/\r?\n/)
      const valid = lines.some((line, index) => {
        const sentence = line.trim()
        if (!/^\$[A-Z0-9]{2}[A-Z]{3},/i.test(sentence)) return false
        if (sentence.includes('*')) return validateNmeaChecksum(sentence)
        return index < lines.length - 1 || /[\r\n]$/.test(text)
      })
      return valid && has('nmea') ? found('nmea') : undefined
    }
    if (gnss) return has(gnss) ? found(gnss) : undefined
    const lines = text.split(/\r?\n/).filter((line) => line.trim())
    if (
      has('json') &&
      lines.length &&
      lines.slice(0, 3).every((line) => {
        try {
          const value: unknown = JSON.parse(line)
          return !!value && typeof value === 'object' && !Array.isArray(value)
        } catch {
          return false
        }
      })
    )
      return found('json')
    if (has('csv') && lines.length >= (name.toLowerCase().endsWith('.csv') ? 2 : 3)) {
      const rows = lines.slice(0, 5).map(splitCsvLine)
      if (rows[0].length >= 2 && rows.every((row) => row.length === rows[0].length))
        return { ...found('csv'), candidate: !name.toLowerCase().endsWith('.csv') }
    }
  }
  const lower = name.toLowerCase()
  if (has('rtcm3') && isRtcmFileName(lower)) return found('rtcm3', 'extension')
  if (has('rinex') && isRnxFileName(lower)) return found('rinex', 'extension')
  if (has('mcap') && lower.endsWith('.mcap')) return found('mcap', 'extension')
  return undefined
}
