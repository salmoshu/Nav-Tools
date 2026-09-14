// 时间与字节格式化。
// 板上录像用 CLOCK_MONOTONIC（非 epoch），UI 一律显示“会话内相对时间”。

/** 纳秒 → "m:ss.mmm"（≥1h 时 "h:mm:ss.mmm"）。 */
export function formatRelativeNs(ns: number, baseNs = 0): string {
  const totalMs = Math.max(0, Math.round((ns - baseNs) / 1e6))
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  const mmm = String(millis).padStart(3, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}.${mmm}` : `${mm}:${ss}.${mmm}`
}

/** 字节数 → 人类可读（KiB/MiB）。 */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`
}
