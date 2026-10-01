import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildOpenComponentArg,
  parseOpenComponentArg,
  writeIcoFromPngDataUrl,
} from '../../electron/main/shortcuts'

describe('parseOpenComponentArg', () => {
  it('extracts a known component id from argv', () => {
    const argv = ['C:\\app\\Nav-Tools.exe', '--open-component=terminal']
    expect(parseOpenComponentArg(argv)).toBe('terminal')
  })

  it('returns undefined for unknown or missing ids', () => {
    expect(parseOpenComponentArg(['Nav-Tools.exe'])).toBeUndefined()
    expect(parseOpenComponentArg(['Nav-Tools.exe', '--open-component=no-such-panel'])).toBeUndefined()
    expect(parseOpenComponentArg(['Nav-Tools.exe', '--open-component='])).toBeUndefined()
  })

  it('round-trips with buildOpenComponentArg', () => {
    const arg = buildOpenComponentArg('gnss-map')
    expect(parseOpenComponentArg([process.execPath, arg])).toBe('gnss-map')
  })
})

describe('writeIcoFromPngDataUrl', () => {
  const tempDir = path.join(os.tmpdir(), 'nav-tools-ico-test')

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('writes a single-frame PNG-compressed ICO container', async () => {
    // 1×1 透明 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    const icoPath = path.join(tempDir, 'nested', 'panel.ico')

    await writeIcoFromPngDataUrl(dataUrl, icoPath)
    const ico = await fs.readFile(icoPath)

    // ICONDIR: reserved=0, type=1(icon), count=1
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(1)
    // ICONDIRENTRY: 256 用 0 表示, planes=1, bitcount=32, 尺寸与偏移
    expect(ico.readUInt8(0 + 6)).toBe(0)
    expect(ico.readUInt8(1 + 6)).toBe(0)
    expect(ico.readUInt16LE(4 + 6)).toBe(1)
    expect(ico.readUInt16LE(6 + 6)).toBe(32)
    expect(ico.readUInt32LE(8 + 6)).toBe(png.length)
    expect(ico.readUInt32LE(12 + 6)).toBe(22)
    // 载荷 = 原始 PNG
    expect(ico.subarray(22)).toEqual(png)
  })

  it('rejects empty icon payloads', async () => {
    const icoPath = path.join(tempDir, 'empty.ico')
    await expect(writeIcoFromPngDataUrl('data:image/png;base64,', icoPath)).rejects.toThrow()
  })
})
