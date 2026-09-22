import { describe, expect, it } from 'vitest'
import {
  crc24q,
  detectGnssRawKind,
  isRnxFileName,
  isRtcmFileName,
  sniffRnx,
  sniffRtcm,
} from '@/core/gnssraw/RtcmFileAccess'

function textBytes(text: string): Uint8Array {
  return Uint8Array.from(text, (ch) => ch.charCodeAt(0))
}

const RINEX_HEAD = textBytes(
  '     3.04           OBSERVATION DATA    M (MIXED)           RINEX VERSION / TYPE\n',
)

function makeRtcmFrame(payload: number[]): Uint8Array {
  const frame = new Uint8Array(3 + payload.length + 3)
  frame[0] = 0xd3
  frame[1] = (payload.length >> 8) & 0x03
  frame[2] = payload.length & 0xff
  frame.set(payload, 3)
  const crc = crc24q(frame, 0, 3 + payload.length)
  frame[3 + payload.length] = (crc >> 16) & 0xff
  frame[4 + payload.length] = (crc >> 8) & 0xff
  frame[5 + payload.length] = crc & 0xff
  return frame
}

const RTCM_STREAM = (() => {
  const a = makeRtcmFrame([0x3e, 0xd0, 0x00, 0x04])
  const b = makeRtcmFrame([0x41, 0x20, 0x00, 0x08])
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
})()

describe('isRnxFileName', () => {
  it('识别 RINEX3 常见扩展名（大小写不敏感）', () => {
    for (const name of ['a.rnx', 'b.OBS', 'c.nav', 'd.gnav', 'e.hnav', 'f.glo', 'g.gps', 'h.gal']) {
      expect(isRnxFileName(name)).toBe(true)
    }
  })

  it('识别 RINEX2 年代式命名（.25o/.99n 等）', () => {
    for (const name of ['abcd.25o', 'ABCD.99N', 'site.23g', 'site.24h', 'site.25l', 'site.25p']) {
      expect(isRnxFileName(name)).toBe(true)
    }
  })

  it('拒绝非 RINEX 名称', () => {
    for (const name of ['a.txt', 'b.25x', 'c.obs.csv', 'RTCM_test', 'd.mcap']) {
      expect(isRnxFileName(name)).toBe(false)
    }
  })
})

describe('sniffRnx', () => {
  it('命中首行 61-80 列的 RINEX 标签', () => {
    expect(sniffRnx(RINEX_HEAD)).toBe(true)
  })

  it('拒绝过短或非 RINEX 内容', () => {
    expect(sniffRnx(textBytes('too short'))).toBe(false)
    expect(sniffRnx(RTCM_STREAM)).toBe(false)
  })
})

describe('detectGnssRawKind', () => {
  it('按扩展名判定 RTCM / RINEX', () => {
    expect(detectGnssRawKind('log.rtcm3', new Uint8Array())).toBe('rtcm')
    expect(detectGnssRawKind('site.25o', new Uint8Array())).toBe('rnx')
    expect(detectGnssRawKind('base.obs', new Uint8Array())).toBe('rnx')
  })

  it('无扩展名时按内容嗅探', () => {
    expect(detectGnssRawKind('RTCM_test', RTCM_STREAM)).toBe('rtcm')
    expect(detectGnssRawKind('rinex_dump', RINEX_HEAD)).toBe('rnx')
  })

  it('RTCM 判定优先于 RINEX', () => {
    // 名字像 RINEX 但内容是 RTCM 流时按 RTCM 处理
    expect(detectGnssRawKind('odd.obs', RTCM_STREAM)).toBe('rtcm')
  })

  it('普通文本 / 空内容返回 null', () => {
    expect(detectGnssRawKind('notes.txt', textBytes('hello world, this is a log line.'))).toBe(null)
    expect(detectGnssRawKind('empty', new Uint8Array())).toBe(null)
  })
})

describe('sniffRtcm', () => {
  it('识别合法 RTCM3 帧序列', () => {
    expect(sniffRtcm(RTCM_STREAM)).toBe(true)
  })

  it('拒绝 CRC 错误或非 RTCM 内容', () => {
    const broken = RTCM_STREAM.slice()
    broken[broken.length - 1] ^= 0xff
    expect(sniffRtcm(broken)).toBe(false)
    expect(sniffRtcm(RINEX_HEAD)).toBe(false)
  })
})

describe('isRtcmFileName', () => {
  it('识别 RTCM 扩展名（大小写不敏感）', () => {
    for (const name of ['a.rtcm3', 'b.RTCM', 'c.rtc', 'd.rt3']) {
      expect(isRtcmFileName(name)).toBe(true)
    }
    expect(isRtcmFileName('a.rtcm3.txt')).toBe(false)
    expect(isRtcmFileName('RTCM_test')).toBe(false)
  })
})
