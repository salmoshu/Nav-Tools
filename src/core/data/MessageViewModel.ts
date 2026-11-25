import { RtkSolutionParser } from '../gnsslib/RtkSolution'
import { formatMessageContent, type MessageDisplayFormat } from './MessageFormat'
import type { MessageField, MessageInspection } from './MessageInspection'
import { inspectNmeaMessage } from './NmeaMessageInspection'
import { inspectRtcmMessage } from './RtcmMessageInspection'
import { csvHeaderKeys, isCsvHeaderRow, parseRegexRecord, splitCsvLine } from './TextRecordParser'

export type InspectableMessageFormat = 'csv' | 'json' | 'regex' | 'nmea' | 'rtcm3' | 'rtklib-pos'

export interface CsvMessageSchema {
  columns: string[]
  headerKey?: string
}

export function identifyCsvMessageSchema(text: string, key: string): CsvMessageSchema {
  const cells = splitCsvLine(text.replace(/^\uFEFF/, ''))
  return isCsvHeaderRow(cells)
    ? { columns: csvHeaderKeys(cells), headerKey: key }
    : { columns: cells.map((_, index) => String(index + 1)) }
}

export function messageText(
  raw: string,
  format: InspectableMessageFormat | 'none',
  display: MessageDisplayFormat,
): string {
  return format === 'rtcm3' ? raw : formatMessageContent(raw, display, 'ascii')
}

function valueText(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? String(value))
}

function field(label: string, value: unknown, unit?: string): MessageField {
  return { label, value: value === null || value === undefined ? '' : valueText(value), unit }
}

function jsonField(label: string, value: unknown, expand: boolean, depth = 0): MessageField {
  const compound = value !== null && typeof value === 'object'
  const result = field(
    label,
    value === null
      ? 'null'
      : compound && depth > 0
        ? Array.isArray(value)
          ? `Array (${value.length})`
          : 'Object'
        : value,
  )
  if (expand && compound && depth < 8) {
    result.children = Object.entries(value).map(([key, child]) =>
      jsonField(key, child, true, depth + 1),
    )
  }
  return result
}

const posQualities: Record<number, string> = {
  0: 'Invalid',
  1: 'Fix',
  2: 'Float',
  3: 'SBAS',
  4: 'DGPS',
  5: 'Single',
  6: 'PPP',
  7: 'Dead reckoning',
}

function inspectPosition(text: string, headers: readonly string[]): MessageInspection | null {
  const input = text.trim()
  if (/^[%+]/.test(input)) {
    const content = input.replace(/^[%+]\s*/, '')
    const colon = content.indexOf(':')
    const fields =
      colon < 0
        ? [field('Header', content)]
        : [field(content.slice(0, colon).trim(), content.slice(colon + 1).trim())]
    return { code: 'POS', title: 'Position file metadata', fields, summary: content }
  }
  if (!/^\d/.test(input)) return null
  const parser = new RtkSolutionParser()
  for (const header of headers) parser.addLine(header)
  const result = parser.addLine(input)
  if (!result) return null
  const quality = posQualities[result.quality] ?? 'Unknown'
  const fields = [
    field('Epoch', result.time),
    field('Solution status', `${quality} (${result.quality})`),
    field('Satellites used', result.satellites),
    field('Position format', result.format.toUpperCase()),
    field('Latitude', result.latitude, '°'),
    field('Longitude', result.longitude, '°'),
    field('Height', result.height, 'm'),
    field('North standard deviation', result.sdn, 'm'),
    field('East standard deviation', result.sde, 'm'),
    field('Up standard deviation', result.sdu, 'm'),
    field('NE covariance term', result.sdne, 'm'),
    field('EU covariance term', result.sdeu, 'm'),
    field('UN covariance term', result.sdun, 'm'),
    field('Differential age', result.age, 's'),
    field('Ambiguity ratio', result.ratio),
  ]
  return {
    code: 'POS',
    title: 'Position solution',
    summary: `${quality} · ${result.satellites} SV · ${result.time}`,
    fields,
  }
}

export function inspectMessage(
  text: string,
  format: InspectableMessageFormat | 'none',
  options: {
    csvColumns?: readonly string[]
    regex?: string
    positionHeaders?: readonly string[]
    details?: boolean
  } = {},
): MessageInspection | null {
  if (format === 'nmea') return inspectNmeaMessage(text)
  if (format === 'rtcm3') return inspectRtcmMessage(text, options.details ?? true)
  if (format === 'rtklib-pos') return inspectPosition(text, options.positionHeaders ?? [])
  if (format === 'none') return null

  let fields: MessageField[]
  if (format === 'csv') {
    fields = splitCsvLine(text).map((value, index) =>
      field(options.csvColumns?.[index] ?? `Column ${index + 1}`, value),
    )
  } else if (format === 'regex') {
    const parsed = parseRegexRecord(text, options.regex)
    if (!parsed.record) return null
    fields = Object.entries(parsed.record).map(([name, value]) =>
      field(name, typeof value === 'string' ? value : String(value)),
    )
  } else {
    try {
      const value: unknown = JSON.parse(text)
      fields =
        value !== null && typeof value === 'object'
          ? Object.entries(value).map(([name, value]) =>
              jsonField(name, value, options.details !== false),
            )
          : [field('Value', value === null ? 'null' : value)]
    } catch {
      return null
    }
  }
  return {
    code: format.toUpperCase(),
    title:
      format === 'csv' ? 'CSV record' : format === 'regex' ? 'Extracted fields' : 'JSON record',
    summary: fields
      .slice(0, 4)
      .map(
        ({ label, value }) =>
          `${label} ${value.length <= 44 ? value.replace(/\s+/g, ' ') : value.slice(0, 41).replace(/\s+/g, ' ') + '…'}`,
      )
      .join(' · '),
    fields,
  }
}
