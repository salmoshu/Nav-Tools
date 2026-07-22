import { LABEL_GLYPHS } from './labelGlyphs'

export interface CameraLabel {
  /** 识别出的文本(已做语法修正) */
  text: string
  /** 平均匹配得分 0~1 */
  score: number
  /** 标签在帧中的左上角坐标 */
  x: number
  y: number
}

interface GlyphBitmap {
  rows: string[]
  width: number
  height: number
}

/** 归一化尺寸(匹配的相位/尺寸容忍核心) */
const NORMALIZED_WIDTH = 8
const NORMALIZED_HEIGHT = 12

interface BoxTop {
  y: number
  x0: number
  x1: number
}

/** 标签识别配置 */
const CONFIG = {
  /** 框顶边最小长度与缺口容忍 */
  boxMinLength: 20,
  boxGapTolerance: 4,
  /** 同一行上断裂框顶候选的合并间隙 */
  boxMergeGap: 20,
  /** 标签条带尺寸 */
  stripAbove: 13,
  stripBelow: 14,
  stripWidth: 140,
  /** 匹配阈值 */
  minGlyphScore: 0.35,
}

type Grid = number[][]

function normalizeBitmap(rows: string[]): Grid {
  const height = rows.length
  const width = rows[0]?.length ?? 1
  const out: Grid = Array.from({ length: NORMALIZED_HEIGHT }, () => Array(NORMALIZED_WIDTH).fill(0))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y][x] !== '#') continue
      const ty = Math.min(NORMALIZED_HEIGHT - 1, Math.floor((y / height) * NORMALIZED_HEIGHT))
      const tx = Math.min(NORMALIZED_WIDTH - 1, Math.floor((x / width) * NORMALIZED_WIDTH))
      out[ty][tx] = 1
    }
  }
  return out
}

function shiftGrid(grid: Grid, dx: number, dy: number): Grid {
  const out: Grid = Array.from({ length: NORMALIZED_HEIGHT }, () => Array(NORMALIZED_WIDTH).fill(0))
  for (let y = 0; y < NORMALIZED_HEIGHT; y++) {
    for (let x = 0; x < NORMALIZED_WIDTH; x++) {
      const sy = y - dy
      const sx = x - dx
      if (sy >= 0 && sy < NORMALIZED_HEIGHT && sx >= 0 && sx < NORMALIZED_WIDTH) {
        out[y][x] = grid[sy][sx]
      }
    }
  }
  return out
}

function jaccard(a: Grid, b: Grid): number {
  let inter = 0
  let union = 0
  for (let y = 0; y < NORMALIZED_HEIGHT; y++) {
    for (let x = 0; x < NORMALIZED_WIDTH; x++) {
      if (a[y][x] || b[y][x]) union++
      if (a[y][x] && b[y][x]) inter++
    }
  }
  return union === 0 ? 0 : inter / union
}

interface TemplateEntry {
  char: string
  width: number
  height: number
  norm: Grid
}

let cachedTemplates: TemplateEntry[] | undefined

function getTemplates(): TemplateEntry[] {
  if (!cachedTemplates) {
    cachedTemplates = []
    for (const [char, bitmaps] of Object.entries(LABEL_GLYPHS)) {
      for (const bitmap of bitmaps) {
        cachedTemplates.push({
          char,
          width: bitmap[0]?.length ?? 0,
          height: bitmap.length,
          norm: normalizeBitmap(bitmap),
        })
      }
    }
  }
  return cachedTemplates
}

/** 数字槽位纠偏:O→0、I/l/|→1(仅用于 ID: 前缀之后) */
function grammarFix(text: string): string {
  const match = text.match(/^(-?I[D0]:)(.*)$/)
  if (!match) return text
  const body = match[2].replace(/[OIl|]/g, (char) => {
    if (char === 'O') return '0'
    return '1'
  })
  return match[1] + body
}

function matchGlyph(rows: string[]): { char: string; score: number } {
  const height = rows.length
  const width = rows[0]?.length ?? 0
  const norm = normalizeBitmap(rows)
  let best = { char: '?', score: 0 }
  for (const template of getTemplates()) {
    if (Math.abs(template.width - width) > 3 || Math.abs(template.height - height) > 4) continue
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const score = jaccard(norm, shiftGrid(template.norm, dx, dy))
        if (score > best.score) best = { char: template.char, score }
      }
    }
  }
  return best
}

interface Span {
  minX: number
  maxX: number
}

/** 谷底切分:超宽 span(相位变化导致字符相连)在墨量最低的内部分列处递归切分 */
function splitWideSpan(span: Span, colInk: number[], maxWidth: number): Span[] {
  if (span.maxX - span.minX + 1 <= maxWidth) return [span]
  let bestX = -1
  let bestInk = Infinity
  for (let x = span.minX + 2; x < span.maxX - 1; x++) {
    if (colInk[x] < bestInk) {
      bestInk = colInk[x]
      bestX = x
    }
  }
  if (bestX < 0) return [span]
  return [
    ...splitWideSpan({ minX: span.minX, maxX: bestX - 1 }, colInk, maxWidth),
    ...splitWideSpan({ minX: bestX, maxX: span.maxX }, colInk, maxWidth),
  ]
}

/**
 * 条带文字识别:列投影切分字符(相位变化导致的笔划内部空列先合并、字符粘连先谷底切分),
 * 再对每个字符位图做模板匹配。
 */
function recognizeStrip(
  isRed: (x: number, y: number) => boolean,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { text: string; score: number } | undefined {
  const stripWidth = x1 - x0
  const colInk: number[] = Array.from({ length: stripWidth }, () => 0)
  for (let x = x0; x < x1; x++) {
    for (let y = y0; y < y1; y++) if (isRed(x, y)) colInk[x - x0]++
  }

  const rawSpans: Span[] = []
  let current: Span | null = null
  for (let i = 0; i < colInk.length; i++) {
    if (colInk[i] > 0) {
      if (!current) current = { minX: i, maxX: i }
      else current.maxX = i
    } else if (current && i - current.maxX >= 2) {
      rawSpans.push(current)
      current = null
    }
  }
  if (current) rawSpans.push(current)

  // 先谷底切分超宽 span(字符相连),再合并小间隙碎片(笔划内部空列)
  const spans: Span[] = []
  for (const raw of rawSpans) {
    for (const piece of splitWideSpan(raw, colInk, 10)) {
      const last = spans[spans.length - 1]
      if (last && piece.minX - last.maxX - 1 <= 2 && piece.maxX - last.minX + 1 <= 10) {
        last.maxX = Math.max(last.maxX, piece.maxX)
      } else {
        spans.push({ ...piece })
      }
    }
  }

  const items: { char: string; score: number }[] = []
  for (const span of spans) {
    let minY = Infinity
    let maxY = -1
    let pixels = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0 + span.minX; x <= x0 + span.maxX; x++) {
        if (isRed(x, y)) {
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
          pixels++
        }
      }
    }
    if (pixels < 2 || maxY < 0) continue
    const height = maxY - minY + 1
    const width = span.maxX - span.minX + 1
    if (height < 2 || height > 16 || width > 14) continue
    const rows: string[] = []
    for (let y = minY; y <= maxY; y++) {
      let row = ''
      for (let x = x0 + span.minX; x <= x0 + span.maxX; x++) row += isRed(x, y) ? '#' : '.'
      rows.push(row)
    }
    const match = matchGlyph(rows)
    if (match.score >= CONFIG.minGlyphScore) items.push(match)
  }
  if (items.length < 4) return undefined

  const text = items.map((item) => (item.score >= 0.5 ? item.char : '?')).join('')
  const score = items.reduce((sum, item) => sum + item.score, 0) / items.length
  return { text, score }
}

function findBoxTops(isGreen: (x: number, y: number) => boolean, width: number, height: number): BoxTop[] {
  const candidates: BoxTop[] = []
  for (let y = 0; y < height; y++) {
    let run: { x0: number; x1: number } | null = null
    const flush = () => {
      if (run && run.x1 - run.x0 >= CONFIG.boxMinLength) {
        const duplicated = candidates.some(
          (candidate) => Math.abs(candidate.y - y) <= 3 && Math.abs(candidate.x0 - run!.x0) <= 3,
        )
        if (!duplicated) candidates.push({ y, x0: run.x0, x1: run.x1 })
      }
      run = null
    }
    for (let x = 0; x < width; x++) {
      if (isGreen(x, y) || (y + 1 < height && isGreen(x, y + 1))) {
        if (!run) run = { x0: x, x1: x }
        else if (x - run.x1 <= CONFIG.boxGapTolerance + 1) run.x1 = x
        else {
          flush()
          run = { x0: x, x1: x }
        }
      }
    }
    flush()
  }

  // 合并同一行上间隙较小的断裂候选(文字/遮挡会打断框顶线)
  candidates.sort((a, b) => a.y - b.y || a.x0 - b.x0)
  const merged: BoxTop[] = []
  for (const candidate of candidates) {
    const last = merged[merged.length - 1]
    if (
      last &&
      Math.abs(candidate.y - last.y) <= 3 &&
      candidate.x0 - last.x1 <= CONFIG.boxMergeGap
    ) {
      last.x1 = Math.max(last.x1, candidate.x1)
      continue
    }
    merged.push({ ...candidate })
  }

  // 丢弃落在其他候选条带内的候选(避免条带内重复检测)
  return merged.filter(
    (candidate, index) =>
      !merged.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          Math.abs(other.y - candidate.y) <= 6 &&
          candidate.x0 >= other.x0 &&
          candidate.x0 <= other.x0 + CONFIG.stripWidth,
      ),
  )
}

/**
 * 从掩码帧中识别 bbox 标签文字。
 * rgb: rgb24 掩码帧(与 CameraStreamService 的 geq 输出一致):
 *   R 通道 = 红字掩码(0 = 文字),G 通道 = 绿框掩码(0 = 框线),B 通道恒为 255。
 * 帧尺寸需与 width/height 一致。
 */
export function recognizeLabels(rgb: Uint8Array, width: number, height: number): CameraLabel[] {
  const isRed = (x: number, y: number) => rgb[(y * width + x) * 3] < 128
  const isGreen = (x: number, y: number) => rgb[(y * width + x) * 3 + 1] < 128

  const labels: CameraLabel[] = []
  for (const box of findBoxTops(isGreen, width, height)) {
    const stripX0 = Math.max(0, box.x0 - 2)
    const stripX1 = Math.min(width, box.x0 + CONFIG.stripWidth)
    const stripY0 = Math.max(0, box.y - CONFIG.stripAbove)
    const stripY1 = Math.min(height, box.y + CONFIG.stripBelow)
    const result = recognizeStrip(isRed, stripX0, stripY0, stripX1, stripY1)
    if (!result) continue
    labels.push({ text: grammarFix(result.text), score: result.score, x: stripX0, y: stripY0 })
  }
  return labels
}

interface VotedLabel {
  text: string
  score: number
  age: number
}

/**
 * 时序投票:按位置分桶保留最近的高分结果,平滑单帧识别错误。
 * 每帧 push 一次,getStable() 返回各位置当前最可信的标签文本。
 */
export class LabelVoter {
  private readonly buckets = new Map<number, VotedLabel[]>()

  constructor(
    private readonly bucketSize = 40,
    private readonly maxAge = 8,
    private readonly agePenalty = 0.04,
  ) {}

  push(labels: CameraLabel[]): void {
    const used = new Set<number>()
    for (const label of labels) {
      const bucket = Math.round(label.x / this.bucketSize)
      used.add(bucket)
      const history = this.buckets.get(bucket) ?? []
      history.push({ text: label.text, score: label.score, age: 0 })
      if (history.length > this.maxAge) history.shift()
      this.buckets.set(bucket, history)
    }
    for (const [bucket, history] of this.buckets) {
      for (const entry of history) entry.age++
      if (!used.has(bucket) && history.every((entry) => entry.age > this.maxAge)) {
        this.buckets.delete(bucket)
      }
    }
  }

  /** 每个位置返回近期最有效得分(score - agePenalty * age)最高的文本(仅展示高置信结果) */
  getStable(): string[] {
    const result: string[] = []
    const ordered = [...this.buckets.keys()].sort((a, b) => a - b)
    for (const bucket of ordered) {
      const history = this.buckets.get(bucket)!
      let best: VotedLabel | undefined
      let bestValue = -1
      for (const entry of history) {
        const value = entry.score - entry.age * this.agePenalty
        if (value > bestValue) {
          bestValue = value
          best = entry
        }
      }
      if (best && best.score >= 0.72) result.push(best.text)
    }
    return result
  }

  reset(): void {
    this.buckets.clear()
  }
}
