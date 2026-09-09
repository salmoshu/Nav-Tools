import type { InssegParseResult, InssegTarget } from './CameraCalibrationTypes'

const PREFIX = '$ESTAR,INSSEG,'
const MAX_LINE = 16_384
const error = (message: string): InssegParseResult => ({ type: 'error', message })

function integer(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) throw new Error('整数格式无效')
  const result = Number(value)
  if (!Number.isSafeInteger(result)) throw new Error('整数超出范围')
  return result
}

function decimal(value: string | undefined): number {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('测量值格式无效')
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error('测量值超出范围')
  return result
}

export function parseInssegLine(line: string): InssegParseResult {
  const match = /^\$([^*]+)\*([\da-fA-F]{2})$/.exec(line.replace(/\r+$/, ''))
  if (!match || !line.startsWith(PREFIX)) return error('INSSEG 报文不完整')
  let checksum = 0
  for (const char of match[1]) checksum ^= char.charCodeAt(0)
  if (checksum !== Number.parseInt(match[2], 16)) return error('INSSEG 校验失败')
  try {
    const fields = match[1].split(',')
    if (!/^\d{6}\.\d{6}\.\d{3}$/.test(fields[2] ?? '')) {
      throw new Error('INSSEG 时间字段格式无效')
    }
    const index = integer(fields[3])
    const pictureIndex = integer(fields[4])
    const count = integer(fields[5])
    if (count > 16) throw new Error('INSSEG 目标数超出协议上限')
    let cursor = 6
    const targets: InssegTarget[] = []
    for (let i = 0; i < count; i++) {
      if (/^P_\d+$/.test(fields[cursor] ?? '')) cursor++
      const target: InssegTarget = {
        classId: integer(fields[cursor++]),
        trackId: integer(fields[cursor++]),
        left: integer(fields[cursor++]),
        top: integer(fields[cursor++]),
        right: integer(fields[cursor++]),
        bottom: integer(fields[cursor++]),
        distance: decimal(fields[cursor++]),
        azimuth: decimal(fields[cursor++]),
      }
      if (target.right <= target.left || target.bottom <= target.top || target.distance <= 0) {
        throw new Error('INSSEG 检测框或距离无效')
      }
      targets.push(target)
    }
    if (fields[cursor] === '') cursor++
    if (cursor !== fields.length) throw new Error('INSSEG 目标数与字段数量不一致')
    return { type: 'frame', frame: { timestamp: fields[2], index, pictureIndex, targets } }
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'INSSEG 解析失败')
  }
}

/** Accept only complete protocol lines, never a quoted command echo or strace text. */
export class InssegParser {
  private buffer = ''

  public reset(): void {
    this.buffer = ''
  }

  public push(chunk: string): InssegParseResult[] {
    if (chunk.length > MAX_LINE * 8) {
      this.reset()
      return [error('INSSEG 输入块过大，已丢弃')]
    }
    this.buffer += chunk
    const results: InssegParseResult[] = []
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r+$/, '')
      this.buffer = this.buffer.slice(newline + 1)
      if (line.length > MAX_LINE) results.push(error('INSSEG 行过长，已丢弃'))
      else if (line.startsWith(PREFIX)) results.push(parseInssegLine(line))
      else if (line.includes('$ESTAR,INSSEG')) results.push(error('拒绝非独立行的 INSSEG 内容'))
    }
    if (this.buffer.length > MAX_LINE) {
      this.reset()
      results.push(error('INSSEG 未收到完整换行报文，缓冲区已清空'))
    }
    return results
  }
}
