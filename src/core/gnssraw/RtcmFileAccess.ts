// RTCM 二进制流文件获取与识别：Electron 走主进程 IPC，Web 降级 File API。
// 扩展名之外提供内容嗅探——实际采样（如 RTCM_test）可能没有扩展名。
import type { GnssRawKind } from './types'

export type { GnssRawKind }

export interface LoadedRtcmBytes {
  name: string
  path?: string
  sizeBytes: number
  bytes: Uint8Array
}

/** 常见 RTCM 扩展名（不含无扩展名采样，交给内容嗅探） */
export const RTCM_FILE_EXTENSIONS = ['rtcm3', 'rtcm', 'rtc', 'rt3'] as const

export function isRtcmFileName(name: string): boolean {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return (RTCM_FILE_EXTENSIONS as readonly string[]).includes(lower.slice(dot + 1))
}

/** 常见 RINEX 扩展名；RINEX2 年代式命名（.23o/.25n…）由正则单独覆盖 */
export const RNX_FILE_EXTENSIONS = [
  'rnx',
  'obs',
  'nav',
  'gnav',
  'hnav',
  'qnav',
  'lnav',
  'cnav',
  'glo',
  'gps',
  'gal',
] as const

const RNX2_NAME_PATTERN = /\.\d{2}[onghqlp]$/i

export function isRnxFileName(name: string): boolean {
  const lower = name.toLowerCase()
  if (RNX2_NAME_PATTERN.test(lower)) return true
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return (RNX_FILE_EXTENSIONS as readonly string[]).includes(lower.slice(dot + 1))
}

/**
 * RINEX 内容嗅探：首行 61-80 列固定为 "RINEX VERSION / TYPE" 标签。
 * Hatanaka 压缩（.crx/.YYd）首行也是该标签但类型为 COMPACT —— 当前不支持，
 * 会在解码阶段以空数据集呈现。
 */
export function sniffRnx(bytes: Uint8Array, probeBytes = 512): boolean {
  if (bytes.length < 80) return false
  const limit = Math.min(bytes.length, probeBytes)
  let text = ''
  for (let i = 0; i < limit; i++) text += String.fromCharCode(bytes[i])
  return text.slice(60, 80) === 'RINEX VERSION / TYPE'
}

/** 按文件名优先、内容嗅探兜底判定 GNSS-Raw 可加载的数据种类。 */
export function detectGnssRawKind(name: string, headBytes: Uint8Array): GnssRawKind | null {
  if (isRtcmFileName(name) || sniffRtcm(headBytes)) return 'rtcm'
  if (isRnxFileName(name) || sniffRnx(headBytes)) return 'rnx'
  return null
}

// —— CRC24Q（RTCM3 校验，多项式 0x1864CFB） ——

const CRC24Q_TABLE = buildCrc24qTable()

function buildCrc24qTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let b = 0; b < 256; b++) {
    let crc = b << 16
    for (let i = 0; i < 8; i++) {
      crc <<= 1
      if (crc & 0x1000000) crc ^= 0x1864cfb
    }
    table[b] = crc & 0xffffff
  }
  return table
}

export function crc24q(bytes: Uint8Array, offset: number, length: number): number {
  let crc = 0
  for (let i = 0; i < length; i++) {
    crc = (((crc << 8) & 0xffffff) ^ CRC24Q_TABLE[((crc >> 16) ^ bytes[offset + i]) & 0xff]) >>> 0
  }
  return crc & 0xffffff
}

/**
 * 内容嗅探：前 probeBytes 内找到至少 minFrames 个 CRC 正确的 RTCM3 帧则判定为 RTCM 流。
 * 对无扩展名采样（RTCM_test）与 .dat 等泛扩展名可靠；文本文件基本不会误中
 * （帧头 0xD3 + 10bit 长度 + CRC24Q 三重约束）。
 */
export function sniffRtcm(bytes: Uint8Array, probeBytes = 8192, minFrames = 2): boolean {
  const limit = Math.min(bytes.length, probeBytes)
  let found = 0
  let i = 0
  while (i + 6 <= limit && found < minFrames) {
    if (bytes[i] !== 0xd3) {
      i++
      continue
    }
    const len = ((bytes[i + 1] & 0x03) << 8) | bytes[i + 2]
    const frameEnd = i + 3 + len + 3
    if (frameEnd > limit) break // 截断，无法验证 CRC；保守否决
    const crc = crc24q(bytes, i, 3 + len)
    const expected = (bytes[frameEnd - 3] << 16) | (bytes[frameEnd - 2] << 8) | bytes[frameEnd - 1]
    if (crc === expected) {
      found++
      i = frameEnd
    } else {
      i++
    }
  }
  return found >= minFrames
}

/** 从本地路径读取（仅 Electron）。 */
export async function readRtcmFromPath(path: string): Promise<LoadedRtcmBytes> {
  const result = await window.electronAPI.gnssRawReadFile(path)
  const bytes = new Uint8Array(result.data)
  return { name: rtcmBasename(path), path, sizeBytes: bytes.byteLength, bytes }
}

/** 浏览器 File 对象（拖拽 / input[type=file] / Web 构建共用）。 */
export async function readRtcmFromFile(file: File): Promise<LoadedRtcmBytes> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const path =
    typeof window !== 'undefined' && window.electronAPI?.getPathForFile
      ? window.electronAPI.getPathForFile(file)
      : undefined
  return { name: file.name, path: path || undefined, sizeBytes: bytes.byteLength, bytes }
}

export function rtcmBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}
