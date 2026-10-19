import type { SftpTransferEvent } from './TerminalTypes'

/**
 * 文件树底部状态栏的下载相位:idle 空态,running 进行中,
 * success/error 为最近一次任务的终态(保留展示直到下次下载或会话切换)。
 */
export type FileTreeDownloadPhase = 'idle' | 'running' | 'success' | 'error'

export interface FileTreeDownloadStatus {
  phase: FileTreeDownloadPhase
  /** 当前/最近任务的展示名;目录下载时随进度事件切换为正在传输的那个文件 */
  name: string
  transferred: number
  /** 0 表示总量未知(WSL tar 流式打包等场景),UI 应显示不定态而非 0% */
  total: number
  error?: string
}

export const IDLE_FILE_TREE_DOWNLOAD: FileTreeDownloadStatus = {
  phase: 'idle',
  name: '',
  transferred: 0,
  total: 0,
}

/** 保存对话框确认后、首个进度事件到达前的本地占位(本机/WSL 通道没有字节级事件) */
export function beginFileTreeDownload(name: string): FileTreeDownloadStatus {
  return { phase: 'running', name, transferred: 0, total: 0 }
}

/** 归约一条 transfer 事件:事件代表此刻真实进度,直接以事件为准;上传方向与状态栏无关 */
export function reduceFileTreeTransferEvent(
  current: FileTreeDownloadStatus,
  event: SftpTransferEvent,
): FileTreeDownloadStatus {
  if (event.direction !== 'download') return current
  return {
    phase: event.status === 'running' ? 'running' : event.status,
    name: event.name,
    transferred: event.transferred,
    total: event.total,
    error: event.error,
  }
}

/**
 * 下载 invoke 落定。失败是权威结果,直接覆盖(本机/WSL 无事件通道,只能在此收尾);
 * 成功只在仍停留 running 时收尾——主进程的成功事件通常已先把相位推进到 success。
 */
export function settleFileTreeDownload(
  current: FileTreeDownloadStatus,
  ok: boolean,
  error?: string,
): FileTreeDownloadStatus {
  if (!ok) return { ...current, phase: 'error', error: error ?? current.error }
  if (current.phase !== 'running') return current
  return { ...current, phase: 'success' }
}

/** 百分比;total 未知(<=0)时返回 null,UI 显示不定态 */
export function fileTreeDownloadPercent(status: FileTreeDownloadStatus): number | null {
  if (status.total <= 0) return null
  return Math.min(100, Math.round((status.transferred / status.total) * 100))
}

/** 一个 running 进度采样点;at 为毫秒时间戳 */
export interface TransferProgressSample {
  at: number
  transferred: number
  total: number
}

/**
 * 相邻两个 running 采样差分估算速率(字节/秒)。以下情况返回 null:
 * 没有上一个采样、total 变化(视为新任务)、字节数回退(新任务或重传)、时间没有前进。
 */
export function estimateTransferRate(
  prev: TransferProgressSample | null,
  next: TransferProgressSample,
): number | null {
  if (!prev || prev.total !== next.total) return null
  const elapsedMs = next.at - prev.at
  const bytes = next.transferred - prev.transferred
  if (elapsedMs <= 0 || bytes <= 0) return null
  return (bytes / elapsedMs) * 1000
}

/** 速率滑动窗口的默认时长:最近 1000ms 的 running 采样参与首尾差分,避免相邻事件差分跳变 */
export const TRANSFER_RATE_WINDOW_MS = 1000

/**
 * 向滑动窗口队列追加一个 running 采样并裁剪:只保留 at >= next.at - windowMs 的样本;
 * 事件稀疏时至少保留上一个样本作为差分锚点,保证速率仍可估算。
 * total 变化或字节回退视为新任务/重传,队列清空后从头累计。
 */
export function pushTransferSample(
  samples: TransferProgressSample[],
  next: TransferProgressSample,
  windowMs: number = TRANSFER_RATE_WINDOW_MS,
): TransferProgressSample[] {
  const last = samples[samples.length - 1]
  if (last && (last.total !== next.total || next.transferred < last.transferred)) return [next]
  const cutoff = next.at - windowMs
  const kept = samples.filter((sample) => sample.at >= cutoff)
  if (kept.length === 0 && last) kept.push(last)
  kept.push(next)
  return kept
}

/**
 * 窗口首尾差分估算速率(字节/秒):样本不足 2 个、total 不一致、
 * 字节回退或时间没有前进时返回 null(与 estimateTransferRate 同一组判空规则)。
 */
export function windowTransferRate(samples: TransferProgressSample[]): number | null {
  if (samples.length < 2) return null
  return estimateTransferRate(samples[0], samples[samples.length - 1])
}

/** 估算剩余秒数;总量未知、速率不可得或已完成(0)时返回 null */
export function remainingTransferSeconds(
  transferred: number,
  total: number,
  rateBytesPerSecond: number | null,
): number | null {
  if (total <= 0 || !rateBytesPerSecond || rateBytesPerSecond <= 0) return null
  const remaining = total - transferred
  if (remaining <= 0) return null
  return remaining / rateBytesPerSecond
}

/**
 * 定宽剩余时长:`00:09` / `01:05`,超过 1 小时为 `1:02:03`(小时不补零)。
 * 秒数向上取整,避免进度未完却显示 00:00;负数与非法输入返回空串。
 */
export function formatRemainingSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const total = Math.ceil(seconds)
  const secs = total % 60
  const minutes = Math.floor(total / 60)
  const mmss = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  if (minutes < 60) return mmss
  const hours = Math.floor(minutes / 60)
  return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/** 字节量的人性化格式,与 SFTP 面板 formatSize 同一约定(1 位小数),补 GB 档 */
export function formatTransferBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/** transferred/total 的同单位格式化结果:数值统一 1 位小数,单位档由 total 决定 */
export interface TransferBytesPair {
  transferred: string
  total: string
  unit: string
}

/**
 * 把 transferred 与 total 放进同一数量级单位(档位取 total 所在档),各保留 1 位小数,
 * 如 '12.3' / '100.0' + 'MB'——同一任务内单位档不变,状态栏宽度才稳定。
 * total <= 0(总量未知)或输入非法时返回 null,调用方回退到 formatTransferBytes。
 */
export function formatTransferPair(transferred: number, total: number): TransferBytesPair | null {
  if (!Number.isFinite(transferred) || !Number.isFinite(total) || transferred < 0 || total <= 0) {
    return null
  }
  const KB = 1024
  const MB = 1024 * 1024
  const GB = 1024 * 1024 * 1024
  const scale =
    total < KB ? { scale: 1, unit: 'B' }
    : total < MB ? { scale: KB, unit: 'KB' }
    : total < GB ? { scale: MB, unit: 'MB' }
    : { scale: GB, unit: 'GB' }
  return {
    transferred: (transferred / scale.scale).toFixed(1),
    total: (total / scale.scale).toFixed(1),
    unit: scale.unit,
  }
}

/** 进度环半径:viewBox 16×16、线宽 2 时恰好内接(r 6.5 + stroke/2 = 7.5 ≤ 8) */
export const FILE_TREE_RING_RADIUS = 6.5

/** 进度环周长:弧长/缺口换算的基准 */
export function fileTreeRingCircumference(radius: number = FILE_TREE_RING_RADIUS): number {
  return 2 * Math.PI * radius
}

/**
 * 进度弧的 stroke-dasharray:`<弧长> <周长>`(缺口从弧尾顺延到一整圈)。
 * percent 为 null(总量未知)时返回 null,UI 改用不定态开口弧;百分比钳制在 0-100。
 */
export function fileTreeRingDasharray(
  percent: number | null,
  radius: number = FILE_TREE_RING_RADIUS,
): string | null {
  if (percent === null) return null
  const clamped = Math.min(100, Math.max(0, percent))
  const circumference = fileTreeRingCircumference(radius)
  return `${((clamped / 100) * circumference).toFixed(2)} ${circumference.toFixed(2)}`
}

/** 不定态(总量未知)开口弧:固定 1/4 弧长,由 CSS 动画整体旋转 */
export function fileTreeRingIndeterminateDasharray(radius: number = FILE_TREE_RING_RADIUS): string {
  const circumference = fileTreeRingCircumference(radius)
  return `${(circumference / 4).toFixed(2)} ${((circumference * 3) / 4).toFixed(2)}`
}

/** transferred/total 的紧凑展示:'12.3/100.0 MB'(斜杠两侧无空格,状态栏宽度更稳定) */
export function formatTransferPairText(pair: TransferBytesPair): string {
  return `${pair.transferred}/${pair.total} ${pair.unit}`
}

