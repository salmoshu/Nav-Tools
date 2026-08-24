import { describe, expect, it } from 'vitest'
import {
  buildIapAskFrame,
  buildIapDataFrame,
  bytesToHex,
  createIapImageInfo,
  extractIapResponseFrames,
  IGK_IAP_TEMPLATE,
  responsePacketIndex,
  responseStatus,
} from '@/core/iap/IapProtocol'

const config = { ...IGK_IAP_TEMPLATE.config }

describe('IGK IAP protocol', () => {
  it('builds the exact ask frame used by UartDebugger', () => {
    const image = createIapImageInfo(55_472, 1024)

    expect(image).toEqual({
      length: 55_472,
      packageSize: 1024,
      fullPackets: 54,
      remainderLength: 176,
      packageCount: 55,
    })
    expect(bytesToHex(buildIapAskFrame(image, config))).toBe('F1010000D8B0003700B00F904D5D')
  })

  it('uses data command 02 and final-remainder command 03', () => {
    const firmware = Uint8Array.of(0x11, 0x22, 0x33, 0x44, 0x55)
    const image = createIapImageInfo(firmware.length, 4)

    expect(bytesToHex(buildIapDataFrame(firmware, image, 0, config))).toBe(
      'F10200001122334497CA9859',
    )
    expect(bytesToHex(buildIapDataFrame(firmware, image, 1, config))).toBe('F103000155A3D9B524')
  })

  it('extracts fragmented handshake and packet ACK frames with CRC validation', () => {
    const buffer: number[] = [0xaa, 0xbb, 0xf1, 0x81]
    expect(extractIapResponseFrames(buffer, config)).toEqual([])

    buffer.push(0x00, 0x00, 0xff, 0x69, 0xdf, 0x69, 0xf1, 0x82, 0x00, 0x00)
    let frames = extractIapResponseFrames(buffer, config)
    expect(frames.map(bytesToHex)).toEqual(['F1810000FF69DF69'])

    buffer.push(0x01, 0x83, 0x21, 0xc0, 0xd6)
    frames = extractIapResponseFrames(buffer, config)
    expect(frames.map(bytesToHex)).toEqual(['F1820000018321C0D6'])
    expect(responsePacketIndex(frames[0], config)).toBe(0)
    expect(responseStatus(frames[0], config)).toBe(1)
    expect(buffer).toEqual([])
  })

  it('does not accept a response with a corrupted checksum', () => {
    const buffer = Array.from(Uint8Array.of(0xf1, 0x82, 0x00, 0x00, 0x01, 0x83, 0x21, 0xc0, 0x00))
    expect(extractIapResponseFrames(buffer, config)).toEqual([])
  })
})
