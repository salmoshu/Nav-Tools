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
