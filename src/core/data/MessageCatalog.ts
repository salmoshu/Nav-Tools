import type { MessageDisplayFormat } from './MessageFormat'
import { messageText, type InspectableMessageFormat } from './MessageViewModel'
import { identifyNmeaMessage } from './NmeaMessageInspection'
import { identifyRtcmMessage } from './RtcmMessageInspection'

export type CatalogFormat = InspectableMessageFormat | 'none'

export interface CatalogRecord {
  key: string
  raw: string
  dataType: CatalogFormat
  isValid: boolean
}

interface MessageKind {
  protocol: string
  group: string
  code: string
  title: string
}

export interface MessageCatalogEntry<T> extends MessageKind {
  id: string
  count: number
  latest: T
}

export function recordMessageFormat(record: CatalogRecord, source: CatalogFormat): CatalogFormat {
  return record.dataType === 'none' ? source : record.dataType
}

function identify(
  record: CatalogRecord,
  source: CatalogFormat,
  encoding: MessageDisplayFormat,
): MessageKind | null {
  const format = recordMessageFormat(record, source)
  if (format === 'none') return null
  if (format === 'rtcm3') {
    const type = record.isValid ? identifyRtcmMessage(record.raw) : null
    return type && { protocol: 'RTCM3', ...type }
  }
  if (format === 'nmea') {
    const type = identifyNmeaMessage(messageText(record.raw, format, encoding))
    return type && { protocol: 'NMEA', ...type }
  }
  if (format === 'rtklib-pos') {
    const text = messageText(record.raw, format, encoding).trim()
    if (/^[%+]/.test(text)) {
      return {
        protocol: 'RTKLIB POS',
        group: 'structured',
        code: 'Header',
        title: 'Solution metadata',
      }
    }
    if (record.isValid || /^\d{1,4}(?:[/-]\d{2}[/-]\d{2}|\s+\d+)[\s,:.]/.test(text)) {
      return {
        protocol: 'RTKLIB POS',
        group: 'structured',
        code: 'Solution',
        title: 'Position solution',
      }
    }
    return null
  }
  if (!record.isValid) return null
  const kind = {
    csv: { protocol: 'CSV', code: 'Row', title: 'CSV record' },
    json: { protocol: 'JSON', code: 'Object', title: 'JSON record' },
    regex: { protocol: 'Regex', code: 'Match', title: 'Extracted fields' },
  }[format]
  return { ...kind, group: 'structured' }
}

interface CatalogSource<T extends CatalogRecord> {
  records: readonly T[]
  format: CatalogFormat
  encoding: MessageDisplayFormat
  csvHeaderKey?: string
  validOnly: boolean
}

export interface MessageCatalog<T extends CatalogRecord> extends CatalogSource<T> {
  entries: Map<string, MessageCatalogEntry<T>>
}

/**
 * Update in arrival order, reusing compatible prefixes and accounting for
 * dropped live rows. Large file histories yield so opening Message stays responsive.
 */
export async function updateMessageCatalog<T extends CatalogRecord>(
  previous: MessageCatalog<T> | undefined,
  next: CatalogSource<T>,
  isCurrent: () => boolean = () => true,
  yieldToUi: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
): Promise<MessageCatalog<T> | undefined> {
  const entries = new Map<string, MessageCatalogEntry<T>>()
  let from = 0
  const { records, format, encoding, csvHeaderKey } = next
  const kindOf = (record: T) =>
    record.key === csvHeaderKey ? null : identify(record, format, encoding)
  const entryId = ({ protocol, group, code }: MessageKind) => `${protocol}/${group}/${code}`

  if (
    previous?.records.length &&
    records.length &&
    previous.format === format &&
    previous.encoding === encoding &&
    previous.csvHeaderKey === csvHeaderKey &&
    previous.validOnly === next.validOnly
  ) {
    const offset = previous.records.findIndex((record) => record.key === records[0].key)
    const overlap = previous.records.length - offset
    if (
      offset >= 0 &&
      overlap <= records.length &&
      records[overlap - 1].key === previous.records.at(-1)?.key
    ) {
      for (const [id, entry] of previous.entries) entries.set(id, { ...entry })
      for (let i = 0; i < offset; i++) {
        const kind = kindOf(previous.records[i])
        const key = kind && entryId(kind)
        if (!key) continue
        const entry = entries.get(key)
        if (entry && --entry.count === 0) entries.delete(key)
      }
      from = overlap
    }
  }

  for (let i = from; i < records.length; i++) {
    if (i !== from && (i - from) % 4096 === 0) {
      await yieldToUi()
      if (!isCurrent()) return undefined
    }
    const record = records[i]
    const kind = kindOf(record)
    if (!kind) continue
    const id = entryId(kind)
    const entry = entries.get(id)
    if (entry) {
      entry.count++
      entry.latest = record
    } else {
      entries.set(id, { ...kind, id, count: 1, latest: record })
    }
  }
  return isCurrent() ? { ...next, entries } : undefined
}
