import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ort = require('onnxruntime-node') as typeof import('onnxruntime-node')

const MODEL_HEIGHT = 48
const MODEL_WIDTH = 320
const CHANNEL_MEAN = 0.5
const CHANNEL_STD = 0.5

let session: import('onnxruntime-node').InferenceSession | undefined
let dict: string[] = []
let loadedModelPath = ''

/**
 * 初始化 PP-OCR rec 模型(懒加载,全局单例)。
 * 传入不同模型路径时会重新加载(便于切换 en/ch 模型)。
 * 失败时返回 false 并记日志,不影响视频播放主流程。
 */
export async function initRec(modelPath: string, dictPath: string): Promise<boolean> {
  if (session && loadedModelPath === modelPath) return true
  try {
    session = await ort.InferenceSession.create(modelPath, { logSeverityLevel: 3 })
    dict = fs
      .readFileSync(dictPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
    loadedModelPath = modelPath
    console.log(`[PaddleRec] model loaded: ${path.basename(modelPath)}, dict=${dict.length}`)
    return true
  } catch (error) {
    console.error('[PaddleRec] 模型加载失败:', error instanceof Error ? error.message : error)
    session = undefined
    loadedModelPath = ''
    return false
  }
}

export function isRecReady(): boolean {
  return session !== undefined
}

/** 双线性缩放 rgb24 图像 */
function resizeBilinear(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const dst = new Uint8Array(dstW * dstH * 3)
  const scaleX = srcW / dstW
  const scaleY = srcH / dstH
  for (let y = 0; y < dstH; y++) {
    const fy = (y + 0.5) * scaleY - 0.5
    const y0 = Math.max(0, Math.floor(fy))
    const y1 = Math.min(srcH - 1, y0 + 1)
    const wy = fy - y0
    for (let x = 0; x < dstW; x++) {
      const fx = (x + 0.5) * scaleX - 0.5
      const x0 = Math.max(0, Math.floor(fx))
      const x1 = Math.min(srcW - 1, x0 + 1)
      const wx = fx - x0
      for (let c = 0; c < 3; c++) {
        const p00 = src[(y0 * srcW + x0) * 3 + c]
        const p01 = src[(y0 * srcW + x1) * 3 + c]
        const p10 = src[(y1 * srcW + x0) * 3 + c]
        const p11 = src[(y1 * srcW + x1) * 3 + c]
        const top = p00 + (p01 - p00) * wx
        const bottom = p10 + (p11 - p10) * wx
        dst[(y * dstW + x) * 3 + c] = Math.round(top + (bottom - top) * wy)
      }
    }
  }
  return dst
}

/** 3x3 反锐化掩模:out = 5*center - up - down - left - right */
function unsharpMask(src: Uint8Array, width: number, height: number): Uint8Array {
  const dst = new Uint8Array(src.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * width + x) * 3 + c
        const center = src[i] * 5
        const up = src[((y > 0 ? y - 1 : y) * width + x) * 3 + c]
        const down = src[((y < height - 1 ? y + 1 : y) * width + x) * 3 + c]
        const left = src[(y * width + (x > 0 ? x - 1 : x)) * 3 + c]
        const right = src[(y * width + (x < width - 1 ? x + 1 : x)) * 3 + c]
        dst[i] = Math.max(0, Math.min(255, center - up - down - left - right))
      }
    }
  }
  return dst
}

/** 预处理:高度缩到 48(保持比例),宽度不足右侧补黑,过宽则压缩到 320 */
function preprocess(strip: Uint8Array, width: number, height: number, sharpen: boolean): Float32Array {
  const ratio = MODEL_HEIGHT / height
  let resizedW = Math.round(width * ratio)
  const resizedH = MODEL_HEIGHT
  let resized: Uint8Array
  if (resizedW > MODEL_WIDTH) {
    resized = resizeBilinear(strip, width, height, MODEL_WIDTH, MODEL_HEIGHT)
    resizedW = MODEL_WIDTH
  } else {
    resized = resizeBilinear(strip, width, height, resizedW, resizedH)
  }
  if (sharpen) resized = unsharpMask(resized, resizedW, resizedH)

  const data = new Float32Array(3 * MODEL_HEIGHT * MODEL_WIDTH)
  for (let y = 0; y < MODEL_HEIGHT; y++) {
    for (let x = 0; x < MODEL_WIDTH; x++) {
      const inRange = x < resizedW
      for (let c = 0; c < 3; c++) {
        const value = inRange ? resized[(y * resizedW + x) * 3 + c] / 255 : 0
        data[c * MODEL_HEIGHT * MODEL_WIDTH + y * MODEL_WIDTH + x] =
          (value - CHANNEL_MEAN) / CHANNEL_STD
      }
    }
  }
  return data
}

export interface RecResult {
  text: string
  /** 保留字符的平均置信度 0~1 */
  confidence: number
}

export interface RecOptions {
  /** 预处理前对缩放后图像做反锐化(对模糊小字有增益) */
  sharpen?: boolean
}

/** 识别一张标签条带(rgb24 像素) */
export async function recognizeStripImage(
  strip: Uint8Array,
  width: number,
  height: number,
  options: RecOptions = {},
): Promise<RecResult> {
  if (!session) return { text: '', confidence: 0 }

  const input = preprocess(strip, width, height, options.sharpen ?? false)
  const tensor = new ort.Tensor('float32', input, [1, 3, MODEL_HEIGHT, MODEL_WIDTH])
  const outputName = session.outputNames[0]
  const results = await session.run({ x: tensor }, [outputName])
  const logits = results[outputName].data as Float32Array
  const timeSteps = results[outputName].dims[1]
  const classes = results[outputName].dims[2]

  // CTC 贪心解码:blank=0,去重复;输出层已是 softmax 概率,max 即为置信度
  const chars: string[] = []
  let confidenceSum = 0
  let confidenceCount = 0
  let prevIndex = -1
  for (let t = 0; t < timeSteps; t++) {
    let bestIndex = 0
    let bestValue = -Infinity
    const offset = t * classes
    for (let c = 0; c < classes; c++) {
      const value = logits[offset + c]
      if (value > bestValue) {
        bestValue = value
        bestIndex = c
      }
    }

    if (bestIndex !== 0 && bestIndex !== prevIndex && bestIndex - 1 < dict.length) {
      chars.push(dict[bestIndex - 1])
      confidenceSum += bestValue
      confidenceCount++
    }
    prevIndex = bestIndex
  }

  return {
    text: chars.join(''),
    confidence: confidenceCount > 0 ? confidenceSum / confidenceCount : 0,
  }
}
