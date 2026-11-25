import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calculateNmeaChecksum } from '@/core/data/NmeaStreamParser'
import { identifyCsvMessageSchema, inspectMessage } from '@/core/data/MessageViewModel'
import { RtcmMessageStream } from '@/core/gnss/RtcmMessages'
import { crc24q } from '@/core/gnssraw/RtcmFileAccess'

const nmea = (body: string) => `$${body}*${calculateNmeaChecksum(`$${body}`)}`

function rtcm(parts: ReadonlyArray<readonly [number, number]>): string {
  const bits = parts.flatMap(([value, width]) => {
    const word = value < 0 ? 2 ** width + value : value
    return Array.from({ length: width }, (_, i) => Math.floor(word / 2 ** (width - i - 1)) % 2)
  })
  const length = Math.ceil(bits.length / 8)
  const bytes = new Uint8Array(length + 6)
  bytes.set([0xd3, length >> 8, length & 255])
  bits.forEach((bit, i) => {
    bytes[3 + (i >> 3)] |= bit << (7 - (i & 7))
  })
  const crc = crc24q(bytes, 0, length + 3)
  bytes.set([crc >> 16, crc >> 8, crc], length + 3)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
}

describe('formatted messages', () => {
  it('identifies CSV headings and preserves quoted, numeric and missing cell text', () => {
    const schema = identifyCsvMessageSchema('Time,Name,Value,,Name', 'heading')
    expect(schema).toEqual({
      columns: ['Time', 'Name', 'Value', '4', 'Name_2'],
      headerKey: 'heading',
    })
    expect(identifyCsvMessageSchema('0,42.0', 'record').headerKey).toBeUndefined()
    expect(
      inspectMessage('0,"A,B",42.00,,"""quoted"""', 'csv', { csvColumns: schema.columns })?.fields,
    ).toMatchObject([
      { label: 'Time', value: '0' },
      { label: 'Name', value: 'A,B' },
      { label: 'Value', value: '42.00' },
      { label: '4', value: '' },
      { label: 'Name_2', value: '"quoted"' },
    ])
  })

  it('shows GNSS coordinates, quality and checksum in GGA', () => {
    const gga = nmea('GNGGA,123501.25,4807.038,N,01131.000,E,4,18,0.9,545.4,M,46.9,M,,')
    expect(inspectMessage(gga, 'nmea')).toMatchObject({
      code: 'GNGGA',
      integrity: 'valid',
      fields: expect.arrayContaining([
        expect.objectContaining({ label: 'UTC time', value: '12:35:01.25' }),
        expect.objectContaining({ label: 'Latitude', value: '48.11730000° (4807.038 N)' }),
        expect.objectContaining({ label: 'Fix quality', value: 'RTK Fix (4)' }),
        expect.objectContaining({ label: 'Satellites used', value: '18' }),
      ]),
    })
    expect(inspectMessage(gga.slice(0, -2) + 'ZZ', 'nmea')?.integrity).toBe('invalid')
    expect(inspectMessage(gga.split('*')[0], 'nmea')?.integrity).toBe('unchecked')
  })

  it('shows each GSV satellite and the optional signal ID without losing blank C/N0', () => {
    const gsv = nmea('GPGSV,1,1,02,03,45,110,47,16,10,040,,1')
    expect(inspectMessage(gsv, 'nmea')).toMatchObject({
      fields: expect.arrayContaining([{ label: 'Signal ID', value: '1' }]),
      tables: [
        {
          columns: ['Satellite', 'Elevation (°)', 'Azimuth (°)', 'C/N0 (dB-Hz)'],
          rows: [
            ['03', '45', '110', '47'],
            ['16', '10', '040', ''],
          ],
        },
      ],
    })
    expect(inspectMessage(nmea('PTEST,alpha,beta'), 'nmea')).toMatchObject({
      note: 'unknown',
      fields: expect.arrayContaining([
        expect.objectContaining({ label: 'Field 2', value: 'beta' }),
      ]),
    })
  })

  it('formats signed RTCM station coordinates and checks the full CRC24Q', () => {
    const frame = rtcm([
      [1006, 12],
      [42, 12],
      [0, 6],
      [14, 4],
      [-27000000000, 38],
      [0, 2],
      [42000000000, 38],
      [0, 2],
      [33000000000, 38],
      [12000, 16],
    ])
    expect(inspectMessage(frame, 'rtcm3')).toMatchObject({
      code: '1006',
      integrity: 'valid',
      fields: expect.arrayContaining([
        { label: 'Station ID', value: '42', unit: undefined },
        { label: 'ECEF X', value: '-2700000.0000', unit: 'm' },
        { label: 'Antenna height', value: '1.2000', unit: 'm' },
      ]),
    })
    const last = Number.parseInt(frame.slice(-2), 16)
    expect(
      inspectMessage(frame.slice(0, -2) + (last ^ 1).toString(16).padStart(2, '0'), 'rtcm3')
        ?.integrity,
    ).toBe('invalid')
    expect(inspectMessage('D3 00 13 FF', 'rtcm3')?.note).toBe('unframed')
  })

  it('decodes PUBX subtypes into actual navigation and satellite fields', () => {
    expect(inspectMessage(nmea('PUBX,03,1,08,U,067,31,42,025'), 'nmea')).toMatchObject({
      code: 'PUBX,03',
      integrity: 'valid',
      tables: [{ rows: [['08', 'Used (U)', '067', '31', '42', '025']] }],
    })
    expect(
      inspectMessage(
        nmea('PUBX,04,073731.00,091202,113851.00,1196,15D,1930035,-2660.664,43'),
        'nmea',
      ),
    ).toMatchObject({
      code: 'PUBX,04',
      fields: expect.arrayContaining([{ label: 'Clock drift', value: '-2660.664', unit: 'ns/s' }]),
    })
  })

  it('decodes MSM7 cell masks, scaled C/N0 and unavailable observation sentinels', () => {
    const frame = rtcm([
      [1077, 12],
      [42, 12],
      [180045, 30],
      [0, 1],
      [0, 3],
      [0, 7],
      [0, 2],
      [0, 2],
      [0, 1],
      [0, 3],
      ...Array.from({ length: 64 }, (_, i) => [i === 2 ? 1 : 0, 1] as const),
      ...Array.from({ length: 32 }, (_, i) => [i === 1 || i === 15 ? 1 : 0, 1] as const),
      [3, 2],
      [70, 8],
      [0, 4],
      [256, 10],
      [-123, 14],
      [5, 20],
      [-524288, 20],
      [16, 24],
      [-8388608, 24],
      [50, 10],
      [700, 10],
      [0, 1],
      [1, 1],
      [772, 10],
      [828, 10],
      [-500, 15],
      [-16384, 15],
    ])
    const result = inspectMessage(frame, 'rtcm3')
    expect(result).toMatchObject({ code: '1077', summary: 'GPS MSM7 · Sta 42 · 1 SV · 2 obs' })
    expect(result?.tables?.[0].rows).toEqual([
      ['G03', '1C', '48.25', '21060420.177', '21060420.1767', '-123.0500', '50', '0'],
      ['G03', '2L', '51.75', '', '', '', '700', '1'],
    ])
    expect(inspectMessage(frame, 'rtcm3', { details: false })?.tables).toBeUndefined()
  })

  it('reads reference station, GPS ephemeris and observations from the actual RTCM3 capture', () => {
    const fixture = readFileSync('tests/fixtures/gnss-spp.rtcm3')
    const records = new RtcmMessageStream().push(fixture)
    const decoded = records
      .filter(({ valid }) => valid)
      .map(({ hex }) => inspectMessage(hex, 'rtcm3')!)
    expect(decoded.find(({ code }) => code === '1005')?.fields).toContainEqual({
      label: 'Station ID',
      value: '1',
      unit: undefined,
    })
    expect(
      decoded
        .find(({ code }) => code === '1019')
        ?.fields.some(({ label }) => label === 'Ephemeris epoch (Toe)'),
    ).toBe(true)
    expect(decoded.find(({ code }) => code === '1004')?.tables?.[0].rows.length).toBeGreaterThan(0)
  })

  it('keeps structured JSON, regex fields and POS quality readable', () => {
    expect(
      inspectMessage('{"temp":3,"nested":{"valid":true},"error":null}', 'json')?.fields,
    ).toMatchObject([
      { label: 'temp', value: '3' },
      { label: 'nested', value: '{\n  "valid": true\n}' },
      { label: 'error', value: 'null' },
    ])
    expect(inspectMessage('speed=12.5m direction=left', 'regex')?.fields).toMatchObject([
      { label: 'speed', value: '12.5' },
      { label: 'direction', value: 'left' },
    ])
    expect(
      inspectMessage('2005/04/02 00:00:30.000 48.1 11.5 501 5 8', 'rtklib-pos')?.summary,
    ).toMatch(/^Single · 8 SV/)
  })
})
