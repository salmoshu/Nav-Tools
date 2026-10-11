/**
 * 板上 MCAP 录像的分片命名与同族展开(纯逻辑,可单测)。
 * trace_sink 落盘为 <trace.dir>/<session名>_<boot>_<pid>/part_<N>.mcap,
 * 多分片同属一段录像;手动只导入其中一片时,应能把整族分片自动补齐。
 */

/** 分片文件名模式:part_0.mcap / part_12.MCAP 等 */
export const MCAP_PART_PATTERN = /^part_(\d+)\.mcap$/i

/** 分片号:非分片文件名返回 undefined */
export function mcapPartIndex(fileName: string): number | undefined {
  const match = MCAP_PART_PATTERN.exec(fileName)
  return match ? Number(match[1]) : undefined
}

/**
 * 从目录条目(纯文件名)中列出 target 所属的分片族,按分片号升序。
 * target 不是分片名、或目录里没有其它分片时返回空数组(调用方按单文件处理)。
 */
export function collectPartFamily(dirEntries: string[], targetName: string): string[] {
  if (mcapPartIndex(targetName) === undefined) return []
  const family = dirEntries.filter((entry) => mcapPartIndex(entry) !== undefined)
  if (!family.some((entry) => entry === targetName)) return []
  return family.sort((a, b) => (mcapPartIndex(a) ?? 0) - (mcapPartIndex(b) ?? 0))
}
