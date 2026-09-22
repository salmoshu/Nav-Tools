/**
 * 文本文件（CSV/JSON/键值对等）回放用的样本时钟历元存储。
 *
 * 与 NumericEpochStore 的墙上时钟不同，这里的时间是“从文件首行起算”的虚拟时间轴：
 * 记录自带数值 time 字段时优先使用（归一化到首条记录为 0），否则按样本间隔递增。
 */

import {
  csvHeaderKeys,
  isCsvHeaderRow,
  parseCsvRecordWithKeys,
  parseTextRecord,
  splitCsvLine,
  type ParsedTextRecord,
  type TextDataParser,
} from '../data/TextRecordParser'

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/** 相对毫秒 → "HH:MM:SS.mmm"（小时不回绕，虚拟时长可超过 24h）。 */
export function formatElapsedTime(milliseconds: number): string {
  const value = Math.max(0, Math.round(milliseconds))
  const hours = Math.floor(value / 3_600_000)
  const minutes = Math.floor(value / 60_000) % 60
  const seconds = Math.floor(value / 1000) % 60
  const millis = value % 1000
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`
}

export class TextEpochStore {
  /** 每个历元相对首历元的毫秒数，非递减。 */
  private readonly timesMs: number[] = []

  public get length(): number {
    return this.timesMs.length
  }

  /** 总时长（毫秒）。 */
  public get duration(): number {
    return this.timesMs.length === 0 ? 0 : this.timesMs[this.timesMs.length - 1]
  }

  /** 追加一个历元（毫秒数会被钳制为非负且非递减），返回其索引。 */
  public append(elapsedMilliseconds: number): number {
    const previous = this.timesMs[this.timesMs.length - 1]
    const finite = Number.isFinite(elapsedMilliseconds) ? elapsedMilliseconds : 0
    const clamped = Math.max(0, finite)
    this.timesMs.push(previous === undefined ? clamped : Math.max(previous, clamped))
    return this.timesMs.length - 1
  }

  public getElapsedTime(index: number): number {
    this.assertIndex(index)
    return this.timesMs[index]
  }

  public formatTime(index: number): string {
    return formatElapsedTime(this.getElapsedTime(index))
  }

  /** 找到距离给定相对时间最近的历元索引，空存储返回 -1。 */
  public findNearestElapsedTime(elapsedMilliseconds: number): number {
    if (this.timesMs.length === 0) return -1
    const target = Math.max(
      0,
      Math.min(Number.isFinite(elapsedMilliseconds) ? elapsedMilliseconds : 0, this.duration),
    )
    let low = 0
    let high = this.timesMs.length - 1
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (this.timesMs[middle] < target) low = middle + 1
      else high = middle
    }
    if (low === 0) return 0
    const previous = low - 1
    return target - this.timesMs[previous] <= this.timesMs[low] - target ? previous : low
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.timesMs.length) {
      throw new RangeError(`epoch index out of range: ${index}`)
    }
  }
}

export interface TextTimelineBuildOptions {
  parser: TextDataParser
  regexPattern?: string
  /** 无 time 字段记录之间的虚拟间隔（毫秒），<=0 时按 20ms 处理。 */
  sampleIntervalMs: number
  /** 是否按 CSV 解析并探测表头（通常由 .csv 扩展名决定）。 */
  isCsv: boolean
}

export interface TextTimelineRecord {
  epochIndex: number
  record: ParsedTextRecord
}

export interface TextTimelineBuildResult {
  store: TextEpochStore
  /** 解析成功的记录（稀疏：仅有效数据行有记录），按历元索引升序。 */
  records: TextTimelineRecord[]
}

// 与 useFlow/useConsole 保持一致：剥离控制台导出文件的时间戳与方向前缀。
const CONSOLE_PREFIX_REGEX =
  /^(\d{2}:\d{2}:\d{2}\.\d+)?\s*(\[MSG ⬅️\]:\s+|\[STR ➡️\]:\s+|\[HEX ➡️\]:\s+)?/

/**
 * 把文本内容构建成样本时钟时间轴：每个非空行一个历元。
 * 有效记录（能解析出字段的行）挂载到对应历元上供图表投影；表头行、垃圾行
 * 只占历元不产生记录，保证控制台投影与原始文件逐行对齐。
 */
export function buildTextTimeline(
  content: string,
  options: TextTimelineBuildOptions,
): TextTimelineBuildResult {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const interval = options.sampleIntervalMs > 0 ? options.sampleIntervalMs : 20
  const store = new TextEpochStore()
  const records: TextTimelineRecord[] = []

  let csvKeys: string[] | undefined
  let csvHeaderProbePending = options.isCsv
  let firstTimeSeconds: number | null = null
  let lastElapsed = 0

  for (const rawLine of lines) {
    if (rawLine.trim() === '') continue
    const cleanedLine = rawLine.replace(CONSOLE_PREFIX_REGEX, '').trim()

    if (csvHeaderProbePending) {
      csvHeaderProbePending = false
      const cells = splitCsvLine(cleanedLine)
      if (isCsvHeaderRow(cells)) {
        csvKeys = csvHeaderKeys(cells)
        store.append(lastElapsed)
        continue
      }
    }

    const parsed =
      options.parser === 'csv'
        ? csvKeys
          ? parseCsvRecordWithKeys(cleanedLine, csvKeys)
          : parseTextRecord(cleanedLine, 'csv')
        : parseTextRecord(cleanedLine, options.parser, options.regexPattern)

    let elapsed = store.length === 0 ? 0 : lastElapsed + interval
    if (parsed.valid && parsed.record) {
      const time = parsed.record.time
      if (typeof time === 'number' && Number.isFinite(time)) {
        if (firstTimeSeconds === null) firstTimeSeconds = time
        elapsed = Math.max(lastElapsed, (time - firstTimeSeconds) * 1000)
      }
      const epochIndex = store.append(elapsed)
      records.push({ epochIndex, record: parsed.record })
    } else {
      store.append(elapsed)
    }
    lastElapsed = elapsed
  }

  return { store, records }
}
