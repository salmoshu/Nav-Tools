// 最近打开的 .mcap 文件列表（仅 Electron 下有本地路径时才有意义）。
import { JsonStorage } from '../storage/JsonStorage'

const RECENT_KEY = 'nav-tools:lidar:recent-mcap-files'
const MAX_ENTRIES = 10

export interface RecentMcapFile {
  path: string
  name: string
  sizeBytes: number
  openedAt: number
  /** 多分片会话的全部分片路径（单文件时缺省）。 */
  paths?: string[]
}

export class McapRecentFiles {
  public constructor(private readonly storage: JsonStorage) {}

  public list(): RecentMcapFile[] {
    return this.storage.read<RecentMcapFile[]>(RECENT_KEY, [], isRecentFileArray)
  }

  public record(entry: { path: string; name: string; sizeBytes: number; paths?: string[] }): void {
    if (!entry.path) return
    const rest = this.list().filter((item) => item.path !== entry.path)
    const next = [{ ...entry, openedAt: Date.now() }, ...rest].slice(0, MAX_ENTRIES)
    this.storage.write(RECENT_KEY, next)
  }

  public remove(path: string): void {
    this.storage.write(
      RECENT_KEY,
      this.list().filter((item) => item.path !== path),
    )
  }
}

function isRecentFileArray(value: unknown): value is RecentMcapFile[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RecentMcapFile).path === 'string' &&
        typeof (item as RecentMcapFile).name === 'string' &&
        typeof (item as RecentMcapFile).sizeBytes === 'number' &&
        typeof (item as RecentMcapFile).openedAt === 'number' &&
        ((item as RecentMcapFile).paths === undefined ||
          (Array.isArray((item as RecentMcapFile).paths) &&
            (item as RecentMcapFile).paths!.every((path) => typeof path === 'string'))),
    )
  )
}
