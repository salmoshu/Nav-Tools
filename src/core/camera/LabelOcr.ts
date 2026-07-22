import { recognizeStripImage } from './PaddleRec'

export interface CameraLabel {
  /** 识别出的文本 */
  text: string
  /** 模型平均置信度 0~1 */
  score: number
  /** 标签在帧中的左上角坐标 */
  x: number
  y: number
}

/**
 * 数字标签格式化(该设备标签格式为 `A,B,C`:A 两位小数、B 三位小数、C 整数)。
 * 模型可能丢失/混淆分隔符,这里在结构强匹配时重建标点;不确定时返回清理后的原文。
 */
export function formatNumericLabel(text: string): string {
  const cleaned = text.replace(/[^\d.,-]/g, '')
  // 已接近标准格式:统一为逗号分隔
  const wellFormed = cleaned.match(/^(-?\d+\.\d{2})[.,\s](\d+\.\d{3})[.,\s](\d+)$/)
  if (wellFormed) return `${wellFormed[1]},${wellFormed[2]},${wellFormed[3]}`

  // 分隔符缺失/错误:按"整数.两位,整数.三位,整数"结构尝试重排
  const parts = cleaned.split(/[.,]/).filter((part) => part.length > 0)
  const negative = cleaned.startsWith('-')
  if (parts.length === 4) {
    const [aInt, aDec, bPart, c] = parts
    if (aDec.length === 2 && bPart.length === 4 && c.length >= 1 && c.length <= 3) {
      return `${negative ? '-' : ''}${aInt}.${aDec},${bPart[0]}.${bPart.slice(1)},${c}`
    }
  }
  return cleaned.replace(/^[.,-]+|[.,-]+$/g, '')
}

interface BoxTop {
  y: number
  x0: number
  x1: number
}

/** 标签识别配置 */
const CONFIG = {
  /** 绿框判定:g 显著高于 r/b */
  greenThreshold: 140,
  greenDominance: 40,
  /** 框顶边最小长度与缺口容忍 */
  boxMinLength: 20,
  boxGapTolerance: 4,
  /** 同一行上断裂框顶候选的合并间隙 */
  boxMergeGap: 20,
  /** 标签条带:左余量与扫描窗口宽度(标签左对齐绘制,溢出总是向右) */
  stripLeftPad: 4,
  stripScanWidth: 160,
  stripAbove: 13,
  stripBelow: 14,
  /** 标签最短文本与最低置信度 */
  minTextLength: 4,
  minConfidence: 0.5,
  /** 红字判定:r 显著高于 g/b */
  redThreshold: 100,
  redDominance: 30,
  /** 红色文字紧致裁剪所需的最低像素数/宽度 */
  minRedPixels: 6,
  minRedWidth: 8,
}

function isGreenPixel(rgb: Uint8Array, width: number, x: number, y: number): boolean {
  const i = (y * width + x) * 3
  const r = rgb[i]
  const g = rgb[i + 1]
  const b = rgb[i + 2]
  return g > CONFIG.greenThreshold && g > r + CONFIG.greenDominance && g > b + CONFIG.greenDominance
}

/** 红字判定:r 显著高于 g/b */
function isRedPixel(rgb: Uint8Array, width: number, x: number, y: number): boolean {
  const i = (y * width + x) * 3
  const r = rgb[i]
  const g = rgb[i + 1]
  const b = rgb[i + 2]
  return r > CONFIG.redThreshold && r > g + CONFIG.redDominance && r > b + CONFIG.redDominance
}

function findBoxTops(rgb: Uint8Array, width: number, height: number): BoxTop[] {
  const isGreen = (x: number, y: number) => isGreenPixel(rgb, width, x, y)
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
    if (last && Math.abs(candidate.y - last.y) <= 3 && candidate.x0 - last.x1 <= CONFIG.boxMergeGap) {
      last.x1 = Math.max(last.x1, candidate.x1)
      continue
    }
    merged.push({ ...candidate })
  }
  return merged
}

/**
 * 从 rgb24 原始帧中识别 bbox 标签文字(PP-OCR rec 模型)。
 * 流程:绿框顶边检测 → 每个框取"框宽 + 水平扩展"条带(右端裁到相邻框左缘)
 * → 模型推理 → CTC 解码。
 */
export async function recognizeLabels(
  rgb: Uint8Array,
  width: number,
  height: number,
): Promise<CameraLabel[]> {
  // 条带参数按帧宽自适应(源设计基于 640px 宽帧)
  const scale = width / 640
  const stripAbove = Math.round(CONFIG.stripAbove * scale)
  const stripBelow = Math.round(CONFIG.stripBelow * scale)
  const stripScanWidth = Math.round(CONFIG.stripScanWidth * scale)
  const stripLeftPad = Math.round(CONFIG.stripLeftPad * scale)
  const minRedPixels = Math.round(CONFIG.minRedPixels * scale * scale)
  const minRedWidth = Math.round(CONFIG.minRedWidth * scale)

  const boxes = findBoxTops(rgb, width, height)
  const labels: CameraLabel[] = []

  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index]
    // 扫描区域:框左缘起固定宽度窗口,右端裁到相邻框左缘,防止隔壁标签串入
    const neighbor = boxes.find(
      (other, otherIndex) =>
        otherIndex !== index && Math.abs(other.y - box.y) <= 6 && other.x0 > box.x0,
    )
    const stripX0 = Math.max(0, box.x0 - stripLeftPad)
    const stripX1 = Math.min(
      width,
      box.x0 + stripScanWidth,
      neighbor ? neighbor.x0 - 2 : width,
    )
    const stripY0 = Math.max(0, box.y - stripAbove)
    const stripY1 = Math.min(height, box.y + stripBelow)
    const regionW = stripX1 - stripX0
    const regionH = stripY1 - stripY0
    if (regionW < 20 || regionH < 6) continue

    // 在条带区域内紧致裁剪红色文字,给模型干净的输入
    let minRX = Infinity
    let maxRX = -1
    let minRY = Infinity
    let maxRY = -1
    let redPixels = 0
    for (let y = stripY0; y < stripY1; y++) {
      for (let x = stripX0; x < stripX1; x++) {
        if (!isRedPixel(rgb, width, x, y)) continue
        minRX = Math.min(minRX, x)
        maxRX = Math.max(maxRX, x)
        minRY = Math.min(minRY, y)
        maxRY = Math.max(maxRY, y)
        redPixels++
      }
    }
    const redWidth = maxRX - minRX + 1
    if (redPixels < minRedPixels || redWidth < minRedWidth) continue

    const cropX0 = Math.max(0, minRX - 2)
    const cropY0 = Math.max(0, minRY - 1)
    const cropX1 = Math.min(width, maxRX + 3)
    const cropY1 = Math.min(height, maxRY + 2)
    const stripW = cropX1 - cropX0
    const stripH = cropY1 - cropY0
    const strip = new Uint8Array(stripW * stripH * 3)
    for (let y = 0; y < stripH; y++) {
      const srcStart = ((cropY0 + y) * width + cropX0) * 3
      strip.set(rgb.subarray(srcStart, srcStart + stripW * 3), y * stripW * 3)
    }

    const result = await recognizeStripImage(strip, stripW, stripH)
    if (process.env.OCR_DEBUG) {
      console.log(
        `[ocr] box@${box.x0}-${box.x1},${box.y} strip=[${cropX0},${cropY0}]-[${cropX1},${cropY1}] red=[${minRX}-${maxRX}]/[${minRY}-${maxRY}] =>`,
        JSON.stringify(result),
      )
    }
    const text = formatNumericLabel(result.text.trim())
    if (text.length < CONFIG.minTextLength || result.confidence < CONFIG.minConfidence) continue

    labels.push({ text, score: result.confidence, x: cropX0, y: cropY0 })
  }
  return labels
}

interface VotedLabel {
  text: string
  score: number
  age: number
}

/**
 * 时序投票:按位置分桶保留最近若干帧结果,逐字符多数投票。
 * 单帧识别错误是随机的(如 6↔8、0↔1),同一标签跨帧多数派能有效抑制。
 * 分桶按标签 x 坐标,人物移动跨过桶时旧桶会自然过期。
 */
export class LabelVoter {
  private readonly buckets = new Map<number, VotedLabel[]>()

  constructor(
    private readonly bucketSize = 40,
    private readonly historySize = 6,
    private readonly maxAge = 3,
  ) {}

  push(labels: CameraLabel[]): void {
    // 先老化既有条目,再写入本帧结果
    for (const history of this.buckets.values()) {
      for (const entry of history) entry.age++
    }
    const used = new Set<number>()
    for (const label of labels) {
      const bucket = Math.round(label.x / this.bucketSize)
      used.add(bucket)
      const history = this.buckets.get(bucket) ?? []
      history.push({ text: label.text, score: label.score, age: 0 })
      if (history.length > this.historySize) history.shift()
      this.buckets.set(bucket, history)
    }
    for (const [bucket, history] of this.buckets) {
      if (!used.has(bucket) && history.every((entry) => entry.age > this.maxAge)) {
        this.buckets.delete(bucket)
      }
    }
  }

  /** 逐字符多数投票:对齐左端,按条目置信度加权 */
  private voteChars(entries: VotedLabel[]): string {
    const maxLen = Math.max(...entries.map((entry) => entry.text.length))
    let result = ''
    for (let i = 0; i < maxLen; i++) {
      const votes = new Map<string, number>()
      let total = 0
      let freshChar = ''
      for (const entry of entries) {
        const char = entry.text[i]
        if (!char) continue
        // 置信度为主,年龄仅轻微衰减(保证多数派生效)
        const weight = entry.score * Math.max(0.5, 1 - entry.age * 0.1)
        votes.set(char, (votes.get(char) ?? 0) + weight)
        total += weight
        if (entry.age === 0 && !freshChar) freshChar = char
      }
      if (total === 0) continue
      let best = freshChar
      let bestWeight = -1
      for (const [char, weight] of votes) {
        if (weight > bestWeight) {
          bestWeight = weight
          best = char
        }
      }
      result += best
    }
    return result
  }

  /** 每个位置返回逐字符投票后的标签文本 */
  getStable(): string[] {
    const result: string[] = []
    const ordered = [...this.buckets.keys()].sort((a, b) => a - b)
    for (const bucket of ordered) {
      const history = this.buckets.get(bucket)!
      const fresh = history.filter((entry) => entry.age === 0)
      if (fresh.length === 0) continue
      const candidates = history.filter((entry) => entry.text.length >= 4)
      if (candidates.length === 0) continue
      const text = this.voteChars(candidates).trim()
      if (text.length >= 4) result.push(text)
    }
    return result
  }

  reset(): void {
    this.buckets.clear()
  }
}
