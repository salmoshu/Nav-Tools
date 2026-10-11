// .mcap 文件获取的平台抽象：Electron 下走主进程（对话框/按路径读取），
// Web 构建下降级为浏览器 File API。两种平台的返回结构一致。
// 板上录像按 part_N.mcap 轮转（≤10MiB/片），因此所有入口都支持一次带回多分片。

export interface LoadedMcapBytes {
  name: string
  path?: string
  sizeBytes: number
  bytes: Uint8Array
}

/** 从本地路径读取（仅 Electron）。 */
export async function readMcapFromPath(path: string): Promise<LoadedMcapBytes> {
  const result = await window.electronAPI.lidarMcapReadFile(path)
  const bytes = new Uint8Array(result.data)
  return { name: mcapBasename(path), path, sizeBytes: bytes.byteLength, bytes }
}

/** 从多个本地路径读取（仅 Electron），按分片数值序返回。 */
export async function readMcapFromPaths(paths: string[]): Promise<LoadedMcapBytes[]> {
  const parts: LoadedMcapBytes[] = []
  for (const path of paths) {
    parts.push(await readMcapFromPath(path))
  }
  return sortMcapParts(parts)
}

/** 浏览器 File 对象（拖拽 / input[type=file] / Web 构建共用）。 */
export async function readMcapFromFile(file: File): Promise<LoadedMcapBytes> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const path =
    typeof window !== 'undefined' && window.electronAPI?.getPathForFile
      ? window.electronAPI.getPathForFile(file)
      : undefined
  return { name: file.name, path: path || undefined, sizeBytes: bytes.byteLength, bytes }
}

/**
 * 单个分片路径自动展开为同目录整族分片(part_N.mcap,数值序)。
 * 手动导入(路径输入/单选/最近文件重开)只给一片时,整段录像也能完整加载;
 * 非分片名、目录不可读或族内仅自身时原样返回。仅 Electron 可用,Web 构建原样返回。
 */
export async function expandMcapPartPaths(paths: string[]): Promise<string[]> {
  if (paths.length !== 1) return paths
  const listFamily = window.electronAPI?.lidarMcapListFamily
  if (!listFamily) return paths
  try {
    const family = await listFamily(paths[0])
    return family.length > 1 ? family : paths
  } catch {
    return paths
  }
}

/** 多个浏览器 File 对象，按分片数值序返回。 */
export async function readMcapFromFiles(files: File[]): Promise<LoadedMcapBytes[]> {
  const parts: LoadedMcapBytes[] = []
  for (const file of files) {
    parts.push(await readMcapFromFile(file))
  }
  return sortMcapParts(parts)
}

/** part_2 与 part_10 按数值序排（字典序会把 10 排到 2 前面）。 */
export function sortMcapParts<T extends { name: string }>(parts: T[]): T[] {
  return [...parts].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

export function mcapBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

/** 多分片共属同一目录时返回目录名（session_*），用于会话展示名；否则返回 undefined。 */
export function mcapCommonDirName(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined
  const dirs = paths.map((path) => {
    const normalized = path.replace(/\\/g, '/')
    const index = normalized.lastIndexOf('/')
    return index >= 0 ? normalized.slice(0, index) : ''
  })
  if (dirs.some((dir) => dir !== dirs[0])) return undefined
  const dir = dirs[0]
  const index = dir.lastIndexOf('/')
  return index >= 0 ? dir.slice(index + 1) : dir || undefined
}
