// GNSS-Raw 的 RTCM 文件接入通道：gnssraw-read-file 按路径整读一个二进制流文件
// （供“最近文件”重新打开与对话框路径加载）。大小限制与 lidarIpc 一致：2GiB 兜底。
import { ipcMain } from 'electron'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'

const MAX_RTCM_BYTES = 2 * 1024 * 1024 * 1024

export function registerGnssRawIpc(): void {
  ipcMain.handle('gnssraw-read-file', async (_event, rawPath: unknown) => {
    if (typeof rawPath !== 'string' || !rawPath.trim()) throw new Error('文件路径无效')
    const filePath = path.resolve(rawPath)
    let stat: fs.Stats
    try {
      stat = await fsPromises.stat(filePath)
    } catch {
      throw new Error(`文件不存在或不可读: ${filePath}`)
    }
    if (!stat.isFile()) throw new Error(`不是文件: ${filePath}`)
    if (stat.size > MAX_RTCM_BYTES) throw new Error('文件超过 2GiB，超出分析支持范围')
    const buffer = await fsPromises.readFile(filePath)
    // 拷成独立 ArrayBuffer，跨 IPC 结构化克隆到渲染进程
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    return { data, size: stat.size }
  })
}
