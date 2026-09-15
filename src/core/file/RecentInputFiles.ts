// 数据接入「文件输入」的最近文件列表：覆盖所有支持的输入类型
// （文本回放 .txt/.csv/.dat/.log 与 LiDAR MCAP 录像，含多分片会话）。
// v1.6.0 的 MCAP 专属最近录像（legacy key）在首次读取时一次性并入。
import { JsonStorage } from '../storage/JsonStorage'

const RECENT_KEY = 'nav-tools:recent-input-files'
const LEGACY_MCAP_KEY = 'nav-tools:lidar:recent-mcap-files'
const MAX_ENTRIES = 10

export interface RecentInputFile {
  path: string
  name: string
  sizeBytes: number
  openedAt: number
  /** 多分片 MCAP 会话的全部分片路径（单文件时缺省） */
  paths?: string[]
}

export class RecentInputFiles {
  private migrated = false

  public constructor(private readonly storage: JsonStorage) {}

  public list(): RecentInputFile[] {
    this.migrateLegacy()
    return this.storage.read<RecentInputFile[]>(RECENT_KEY, [], isRecentFileArray)
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

  /** 旧版 MCAP 专属最近录像并入：按 path 去重保留较新的 openedAt，随后删除旧键。 */
  private migrateLegacy(): void {
    if (this.migrated) return
    this.migrated = true
    const legacy = this.storage.read<RecentInputFile[]>(LEGACY_MCAP_KEY, [], isRecentFileArray)
    if (legacy.length === 0) return
    const current = this.storage.read<RecentInputFile[]>(RECENT_KEY, [], isRecentFileArray)
    const byPath = new Map<string, RecentInputFile>()
    for (const item of [...legacy, ...current]) {
      const existing = byPath.get(item.path)
      if (!existing || item.openedAt > existing.openedAt) byPath.set(item.path, item)
    }
    const merged = [...byPath.values()].sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX_ENTRIES)
    this.storage.write(RECENT_KEY, merged)
    this.storage.remove(LEGACY_MCAP_KEY)
  }
}

function isRecentFileArray(value: unknown): value is RecentInputFile[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RecentInputFile).path === 'string' &&
        typeof (item as RecentInputFile).name === 'string' &&
        typeof (item as RecentInputFile).sizeBytes === 'number' &&
        typeof (item as RecentInputFile).openedAt === 'number' &&
        ((item as RecentInputFile).paths === undefined ||
          (Array.isArray((item as RecentInputFile).paths) &&
            (item as RecentInputFile).paths!.every((path) => typeof path === 'string'))),
    )
  )
}
