import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  collectPartFamily,
  MCAP_PART_PATTERN,
  mcapPartIndex,
} from '@/core/lidar/McapPartFamily'

const playerSource = readFileSync('src/composables/useMcapPlayer.ts', 'utf8')
const lidarIpcSource = readFileSync('electron/main/lidarIpc.ts', 'utf8')
const preloadSource = readFileSync('electron/preload/index.ts', 'utf8')
const envTypesSource = readFileSync('src/vite-env.d.ts', 'utf8')

describe('McapPartFamily 分片名识别', () => {
  it('识别 part_N.mcap(大小写不敏感)', () => {
    expect(mcapPartIndex('part_0.mcap')).toBe(0)
    expect(mcapPartIndex('part_12.MCAP')).toBe(12)
    expect(MCAP_PART_PATTERN.test('part_3.mcap')).toBe(true)
  })

  it('非分片名返回 undefined', () => {
    expect(mcapPartIndex('foo.mcap')).toBeUndefined()
    expect(mcapPartIndex('part_.mcap')).toBeUndefined()
    expect(mcapPartIndex('part_1.mcap.txt')).toBeUndefined()
    expect(mcapPartIndex('xpart_1.mcap')).toBeUndefined()
    expect(mcapPartIndex('session.txt')).toBeUndefined()
  })
})

describe('McapPartFamily 同族展开', () => {
  const dir = ['part_0.mcap', 'part_2.mcap', 'part_10.mcap', 'session.txt', 'notes.log']

  it('列出整族并按分片号数值序排列(part_10 在 part_2 之后)', () => {
    expect(collectPartFamily(dir, 'part_0.mcap')).toEqual([
      'part_0.mcap',
      'part_2.mcap',
      'part_10.mcap',
    ])
  })

  it('族内仅自身时返回单元素(下游不展开)', () => {
    expect(collectPartFamily(['part_0.mcap', 'a.txt'], 'part_0.mcap')).toEqual(['part_0.mcap'])
  })

  it('目标不是分片名或不在目录中时返回空', () => {
    expect(collectPartFamily(dir, 'foo.mcap')).toEqual([])
    expect(collectPartFamily(['foo.mcap'], 'part_0.mcap')).toEqual([])
  })
})

describe('McapPartFamily 接线', () => {
  it('手动导入与文件摘入都经过同族展开', () => {
    // 路径入口(数据接入文件页签/手动输入/最近文件)与文件入口(拖放)均展开
    expect(playerSource).toContain('readMcapFromPaths(await expandMcapPartPaths(unique))')
    expect(playerSource).toContain('const family = await expandMcapPartPaths([path])')
  })

  it('主进程提供同族分片列举 IPC 并声明类型', () => {
    expect(lidarIpcSource).toContain("ipcMain.handle('lidar-mcap-list-family'")
    expect(lidarIpcSource).toContain('collectPartFamily')
    expect(preloadSource).toContain('lidarMcapListFamily')
    expect(envTypesSource).toContain('lidarMcapListFamily: (path: string) => Promise<string[]>')
  })
})
