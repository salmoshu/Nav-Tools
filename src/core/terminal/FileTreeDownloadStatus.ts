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

/** 紧凑时长:`8s` / `2m 05s` / `1h 03m`;负数与非法输入返回空串 */
export function formatRemainingSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const total = Math.max(1, Math.ceil(seconds))
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  if (minutes < 60) return `${minutes}m ${String(secs).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** 字节量的人性化格式,与 SFTP 面板 formatSize 同一约定(1 位小数),补 GB 档 */
export function formatTransferBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}
