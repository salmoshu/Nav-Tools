// LiDAR MCAP 回放的文件接入通道：
// - lidar-mcap-read-file：按路径整读一个 .mcap（供“最近文件”重新打开与分片展开）
// 大小限制与 TextFileStream 的定位一致：板上分片 ≤10MiB，这里按 2GiB 兜底。
// 文件选择由渲染侧的 <input type="file">（Input 对话框 MCAP 页签）承担，
// Web/Electron 同一路径，不再单独开系统对话框。
import { ipcMain } from 'electron'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'

const MAX_MCAP_BYTES = 2 * 1024 * 1024 * 1024

export function registerLidarIpc(): void {
  ipcMain.handle('lidar-mcap-read-file', async (_event, rawPath: unknown) => {
    if (typeof rawPath !== 'string' || !rawPath.trim()) throw new Error('文件路径无效')
    const filePath = path.resolve(rawPath)
    let stat: fs.Stats
    try {
      stat = await fsPromises.stat(filePath)
    } catch {
      throw new Error(`文件不存在或不可读: ${filePath}`)
    }
    if (!stat.isFile()) throw new Error(`不是文件: ${filePath}`)
    if (stat.size > MAX_MCAP_BYTES) throw new Error('文件超过 2GiB，超出回放支持范围')
    const buffer = await fsPromises.readFile(filePath)
    // 拷成独立 ArrayBuffer，跨 IPC 结构化克隆到渲染进程
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    return { data, size: stat.size }
  })
}
