import type { RtkPostOptions, RtkPostProgress } from './RtkPost'

export interface RtkPostTimeSpan {
  start: number
  end: number
}

/** rnx2rtkp terminates status messages with CR, and pipe chunks may split any record. */
export class RtkPostLogDecoder {
  private readonly pending = { stdout: '', stderr: '' }

  public push(stream: 'stdout' | 'stderr', chunk: string): string[] {
    const lines = (this.pending[stream] + chunk).split(/\r\n|[\r\n]/)
    this.pending[stream] = (lines.pop() ?? '').slice(-16_384)
    return lines.map((line) => line.trim()).filter(Boolean)
  }

  public flush(): string[] {
    const lines = Object.values(this.pending)
      .map((line) => line.trim())
      .filter(Boolean)
    this.pending.stdout = this.pending.stderr = ''
    return lines
  }
}

export class RtkPostProgressTracker {
  private previousTime: number | undefined
  private backwardPass = false
  private percentage = 0
  private readonly direction: number
  private readonly span: RtkPostTimeSpan | undefined

  public constructor(span: RtkPostTimeSpan | undefined, options: RtkPostOptions) {
    this.direction = options.mode === 0 ? 0 : options.solutionType
    const start = span?.start ?? parseCalendarTime(options.startTime)
    const end = span?.end ?? parseCalendarTime(options.endTime)
    if (start !== undefined && end !== undefined) {
      const requestedStart = parseCalendarTime(options.startTime)
      const requestedEnd = parseCalendarTime(options.endTime)
      const effectiveStart = Math.max(start, requestedStart ?? start)
      const effectiveEnd = Math.min(end, requestedEnd ?? end)
      if (effectiveEnd > effectiveStart) this.span = { start: effectiveStart, end: effectiveEnd }
    }
  }

  public update(line: string): RtkPostProgress | null {
    const match = line.match(
      /^processing\s*:\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)/i,
    )
    if (!match) return null
    const time = parseCalendarTime(match[1])
    if (time === undefined) return null
    if (this.direction === 2 && this.previousTime !== undefined && time < this.previousTime) {
      this.backwardPass = true
    }
    this.previousTime = time
    if (!this.span)
      return {
        phase: 'processing',
        percentage: null,
        processingTime: match[1],
        processingMessage: line,
      }
    const fraction = Math.max(
      0,
      Math.min(1, (time - this.span.start) / (this.span.end - this.span.start)),
    )
    const progress =
      this.direction === 1
        ? 1 - fraction
        : this.direction === 2
          ? (this.backwardPass ? 2 - fraction : fraction) / 2
          : fraction
    this.percentage = Math.max(this.percentage, Math.min(99, Math.floor(progress * 100)))
    return {
      phase: 'processing',
      percentage: this.percentage,
      processingTime: match[1],
      processingMessage: line,
    }
  }
}

/** Read bounded head/tail samples, supporting both RINEX 2 and RINEX 3 epochs. */
export function rinexObservationSpan(head: string, tail: string): RtkPostTimeSpan | undefined {
  const header = head.split('END OF HEADER')[0]
  const first = header.split(/\r?\n/).find((line) => line.includes('TIME OF FIRST OBS'))
  const last = header.split(/\r?\n/).find((line) => line.includes('TIME OF LAST OBS'))
  const headerEnd = head.indexOf('END OF HEADER')
  const firstEpochs = observationEpochs(headerEnd < 0 ? head : head.slice(headerEnd + 13))
  const lastEpochs = observationEpochs(tail)
  let start =
    firstEpochs[0] ?? (first ? parseEpochFields(first.slice(0, 43).trim().split(/\s+/)) : undefined)
  let end =
    lastEpochs.at(-1) ??
    (last ? parseEpochFields(last.slice(0, 43).trim().split(/\s+/)) : undefined)
  // Match the Open-GNSS RINEX reader: GLO observation epochs are UTC and
  // rnx2rtkp's -ts/-te arguments are GPST. Other supported systems are left
  // in the same representation used by the engine's observation reader.
  const versionLine = header.split(/\r?\n/).find((line) => line.includes('RINEX VERSION / TYPE'))
  const firstSystem = first?.slice(48, 51).trim().toUpperCase()
  const recognized = ['GPS', 'GLO', 'GAL', 'QZS', 'BDT', 'IRN']
  const usesUtc =
    firstSystem === 'GLO' || (!recognized.includes(firstSystem ?? '') && versionLine?.[40] === 'R')
  if (usesUtc) {
    if (start !== undefined) start += utcToGpsOffset(start)
    if (end !== undefined) end += utcToGpsOffset(end)
  }
  return start !== undefined && end !== undefined && end > start ? { start, end } : undefined
}

// Same leap-second table used by Open-GNSS src/rtkcmn.c.
function utcToGpsOffset(time: number): number {
  const dates = [
    [2017, 1],
    [2015, 7],
    [2012, 7],
    [2009, 1],
    [2006, 1],
    [1999, 1],
    [1997, 7],
    [1996, 1],
    [1994, 7],
    [1993, 7],
    [1992, 7],
    [1991, 1],
    [1990, 1],
    [1988, 1],
    [1985, 7],
    [1983, 7],
    [1982, 7],
    [1981, 7],
  ]
  const index = dates.findIndex(([year, month]) => time >= Date.UTC(year, month - 1, 1))
  return index < 0 ? 0 : (18 - index) * 1000
}

function observationEpochs(text: string): number[] {
  const times: number[] = []
  for (const line of text.split(/\r?\n/)) {
    const modern = line.match(
      /^>\s*(\d{4})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d+(?:\.\d+)?)\s+[01]\s+\d+/,
    )
    const legacy =
      !modern &&
      line.match(
        /^\s?(\d{2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d+(?:\.\d+)?)\s+[01]\s*\d+/,
      )
    const fields =
      modern?.slice(1) ??
      (legacy
        ? [String(Number(legacy[1]) + (Number(legacy[1]) < 80 ? 2000 : 1900)), ...legacy.slice(2)]
        : undefined)
    const time = fields ? parseEpochFields(fields) : undefined
    if (time !== undefined) times.push(time)
  }
  return times
}

export function parseCalendarTime(text: string): number | undefined {
  const fields = text
    .trim()
    .match(/^(\d{4})[-/](\d{2})[-/](\d{2})[T\s]+(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/)
  return fields ? parseEpochFields([...fields.slice(1, 6), fields[6] ?? '0']) : undefined
}

/** GPST calendar fields, deliberately independent of the computer's local time zone. */
export function formatRtkPostTime(time: number): string {
  const iso = new Date(Math.round(time)).toISOString().replace('Z', '')
  return iso.replace(/\.000$/, '')
}

export function intersectObservationSpans(
  rover: RtkPostTimeSpan,
  base?: RtkPostTimeSpan | null,
): RtkPostTimeSpan | undefined {
  const start = Math.max(rover.start, base?.start ?? rover.start)
  const end = Math.min(rover.end, base?.end ?? rover.end)
  return end > start ? { start, end } : undefined
}

function parseEpochFields(fields: string[]): number | undefined {
  if (fields.length < 6) return undefined
  const [year, month, day, hour, minute, second] = fields.map(Number)
  if (
    ![year, month, day, hour, minute, second].every(Number.isFinite) ||
    year < 1980 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second >= 60
  )
    return undefined
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return date.getTime() + second * 1000
}
