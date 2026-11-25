import { describe, expect, it } from 'vitest'
import { RtcmMessageStream } from '@/core/gnss/RtcmMessages'
import { crc24q } from '@/core/gnssraw/RtcmFileAccess'

function frame(payload: number[]): Uint8Array {
  const bytes = [0xd3, payload.length >> 8, payload.length & 255, ...payload]
  const crc = crc24q(Uint8Array.from(bytes), 0, bytes.length)
  return Uint8Array.from([...bytes, crc >> 16, (crc >> 8) & 255, crc & 255])
}

const hex = (bytes: ArrayLike<number>) =>
  Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ')

describe('original RTCM3 Messages stream', () => {
  it('emits one complete, unchanged message even when a frame is split across chunks', () => {
    const stream = new RtcmMessageStream()
    const first = frame([0x3e, 0xd0, 0xab])
    const second = frame([0x43, 0x20, 0xff])

    expect(stream.push(first.slice(0, 1))).toEqual([])
    expect(stream.push(first.slice(1, 5))).toEqual([])
    expect(stream.push(Uint8Array.from([...first.slice(5), ...second]))).toEqual([
      { hex: hex(first), valid: true },
      { hex: hex(second), valid: true },
    ])
    expect(stream.finish()).toEqual([])
  })

  it('keeps invalid bytes and truncated frames visible without marking them valid', () => {
    const stream = new RtcmMessageStream()
    const good = frame([0x3e, 0xd0, 0x02])
    const bad = frame([0x43, 0x20, 0x01])
    bad[bad.length - 1] ^= 1
    const leading = [0x7f, 0xd3, 0xfc, ...bad]
    const trailing = good.slice(0, -1)

    expect(stream.push(Uint8Array.from([...leading, ...good, ...trailing]))).toEqual([
      { hex: hex(leading), valid: false },
      { hex: hex(good), valid: true },
    ])
    expect(stream.finish()).toEqual([{ hex: hex(trailing), valid: false }])
    expect(stream.finish()).toEqual([])
  })
})
