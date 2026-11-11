import { describe, expect, it } from 'vitest'
import { detectDataFormat, DETECTABLE_FORMATS } from '@/core/data/DataFormat'
import { crc24q } from '@/core/gnssraw/RtcmFileAccess'
import { useAutoFormatSettings } from '@/composables/useAutoFormatSettings'
import { calculateNmeaChecksum } from '@/core/data/NmeaStreamParser'

const text = (value: string) => new TextEncoder().encode(value)
function frame(): Uint8Array {
  const data = new Uint8Array([0xd3, 0, 4, 0x3e, 0xd0, 0, 4, 0, 0, 0])
  const crc = crc24q(data, 0, 7)
  data.set([crc >> 16, (crc >> 8) & 255, crc & 255], 7)
  return data
}
const frames = new Uint8Array([...frame(), ...frame()])

describe('data format detection', () => {
  it('detects RTCM by CRC even with a generic suffix and rejects disabled formats', () => {
    expect(detectDataFormat(frames, 'capture.dat', ['rtcm3'])).toEqual({
      format: 'rtcm3',
      evidence: 'content',
    })
    expect(detectDataFormat(frames, 'capture.obs', ['rinex'])).toBeUndefined()
    const broken = frames.slice()
    broken[broken.length - 1] ^= 1
    expect(detectDataFormat(broken, 'capture.dat', ['rtcm3'])).toBeUndefined()
  })
  it('detects RINEX and MCAP by content regardless of filename', () => {
    const rinex = text(
      '     3.04           OBSERVATION DATA    M (MIXED)           RINEX VERSION / TYPE\n',
    )
    expect(detectDataFormat(rinex, 'capture.bin', DETECTABLE_FORMATS)?.format).toBe('rinex')
    expect(
      detectDataFormat(
        new Uint8Array([137, 77, 67, 65, 80, 48, 13, 10]),
        'capture',
        DETECTABLE_FORMATS,
      )?.format,
    ).toBe('mcap')
  })
  it('detects GNSS and structured text, while disabled NMEA does not fall through to CSV', () => {
    const sentence = '$GNGGA,123500,4807.038,N,01131.000,E,4,18,0.9,545.4,M,46.9,M,,'
    const nmea = text(`${sentence}*${calculateNmeaChecksum(sentence)}\n`)
    expect(detectDataFormat(nmea, 'x.log', ['nmea'])?.format).toBe('nmea')
    expect(detectDataFormat(nmea, 'x.csv', ['csv'])).toBeUndefined()
    expect(detectDataFormat(text(`${sentence}*00\n`), 'x', ['nmea'])).toBeUndefined()
    expect(detectDataFormat(text('{"a":1}\n{"a":2}\n'), 'x', ['json'])?.format).toBe('json')
    expect(detectDataFormat(text('a,b\n1,2\n3,4\n'), 'x', ['csv'])?.format).toBe('csv')
  })
  it('keeps independent editable and resettable application defaults', () => {
    const settings = useAutoFormatSettings()
    settings.resetFormats('gnss')
    settings.resetFormats('gnssraw')
    expect(settings.formatsFor('gnss')).toEqual(['nmea', 'rtklib-pos'])
    expect(settings.formatsFor('gnssraw')).toEqual(['rtcm3', 'rinex'])
    settings.setFormats('gnss', ['rtcm3'])
    expect(settings.formatsFor('gnss')).toEqual(['rtcm3'])
    expect(settings.formatsFor('gnssraw')).toEqual(['rtcm3', 'rinex'])
    settings.resetFormats('gnss')
    expect(settings.formatsFor('gnss')).toEqual(['nmea', 'rtklib-pos'])
  })
})
