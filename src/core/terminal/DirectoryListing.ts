import type { SftpEntry } from './TerminalTypes'

/**
 * 解析 WSL 侧 `find -printf '%y\t%s\t%T@\t%f\n'` 的输出。
 *
 * 文件名是最后一列且可能本身含制表符,所以只在前三个分隔符处切开,
 * 剩下的整段都算文件名。含换行的文件名无法与记录分隔区分,属于 find
 * -printf 的固有边界,这类条目会被丢弃而不是被错误截断。
 */
export function parseFindListing(output: string, directory: string): SftpEntry[] {
  const entries: SftpEntry[] = []
  // 根目录与以分隔符结尾的目录都会拼出双斜杠,先归一
  const base = directory.endsWith('/') ? directory.slice(0, -1) : directory
  for (const line of output.split('\n')) {
    if (!line) continue
    const first = line.indexOf('\t')
    const second = line.indexOf('\t', first + 1)
    const third = line.indexOf('\t', second + 1)
    if (first < 0 || second < 0 || third < 0) continue
    const name = line.slice(third + 1)
    if (!name) continue
    const size = Number.parseInt(line.slice(first + 1, second), 10)
    const modified = Number.parseFloat(line.slice(second + 1, third))
    entries.push({
      name,
      path: `${base}/${name}`,
      directory: line.slice(0, first) === 'd',
      size: Number.isFinite(size) ? size : 0,
      modifiedAt: Number.isFinite(modified) ? Math.round(modified * 1000) : 0,
      mode: 0,
    })
  }
  return sortDirectoryEntries(entries)
}

/** 目录在前、同级按字典序:与 SFTP 侧列表顺序一致,避免切换会话时条目跳位 */
export function sortDirectoryEntries(entries: SftpEntry[]): SftpEntry[] {
  return entries.sort(
    (a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name),
  )
}
