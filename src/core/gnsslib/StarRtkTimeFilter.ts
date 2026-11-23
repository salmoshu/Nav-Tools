import { validateNmeaChecksum } from '../data/NmeaStreamParser'
import { parseCalendarTime } from './RtkPostProgress'
import { RtkSolutionParser } from './RtkSolution'

export function filterStarRtkSolutionText(
  text: string,
  format: 'llh' | 'nmea',
  startText: string,
  endText: string,
): string {
  if (!startText.trim() && !endText.trim()) return text
  const start = startText.trim() ? requiredTime(startText, '开始时间') : Number.NEGATIVE_INFINITY
  const end = endText.trim() ? requiredTime(endText, '结束时间') : Number.POSITIVE_INFINITY
  if (start >= end) throw new Error('结束时间必须晚于开始时间')
  const lines = text.split(/\r?\n/)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const trailingNewline = text.endsWith('\n')
  if (trailingNewline) lines.pop()
  const filtered = format === 'nmea' ? filterNmea(lines, start, end) : filterPos(lines, start, end)
  return `${filtered.join(eol)}${trailingNewline ? eol : ''}`
}

function requiredTime(text: string, label: string): number {
  const value = parseCalendarTime(text)
  if (value === undefined) throw new Error(`${label}格式无效`)
  return value
}

function within(time: number, start: number, end: number): boolean {
  return time >= start && time <= end
}

function filterPos(lines: string[], start: number, end: number): string[] {
  const parser = new RtkSolutionParser()
  return lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('%') || trimmed.startsWith('+')) {
      if (trimmed) parser.addLine(trimmed)
      return true
    }
    const solution = parser.addLine(line)
    if (!solution) return true
    const time = parseCalendarTime(solution.time)
    return time !== undefined && within(time, start, end)
  })
}

function filterNmea(lines: string[], start: number, end: number): string[] {
  let epoch: number | null = null
  return lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('$')) return true
    if (/^\$[A-Z]{2}RMC,/.test(trimmed)) {
      epoch = rmcEpoch(trimmed)
      return epoch === null || within(epoch, start, end)
    }
    return epoch === null || within(epoch, start, end)
  })
}

function rmcEpoch(line: string): number | null {
  if (!validateNmeaChecksum(line)) return null
  const fields = line.slice(1, line.indexOf('*')).split(',')
  const time = fields[1]?.match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)$/)
  const date = fields[9]?.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (!time || !date) return null
  const year = Number(date[3]) + (Number(date[3]) >= 80 ? 1900 : 2000)
  return parseCalendarTime(`${year}-${date[2]}-${date[1]}T${time[1]}:${time[2]}:${time[3]}`) ?? null
}
