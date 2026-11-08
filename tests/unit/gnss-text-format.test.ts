import { describe, expect, it } from 'vitest'
import { detectGnssTextParser } from '@/core/data/GnssTextFormat'

describe('GNSS text format detection', () => {
  it('recognizes NMEA content regardless of the file suffix', () => {
    expect(
      detectGnssTextParser(
        '$GPGGA,123519.00,4807.038,N,01131.000,E,4,18,0.9,545.4,M,46.9,M,,*47\n',
      ),
    ).toBe('nmea')
  })

  it('recognizes RTKLIB POS rows from their header and solution data', () => {
    expect(
      detectGnssTextParser(
        [
          '% GPST latitude(deg) longitude(deg) height(m) Q ns sdn(m) sde(m) sdu(m)',
          '2024/04/26 03:21:26.000 39.980744192 116.476662780 63.7868 1 37 0.01 0.01 0.01',
        ].join('\n'),
      ),
    ).toBe('rtklib-pos')
  })

  it('returns undefined for unrelated text', () => {
    expect(detectGnssTextParser('hello,world\n1,2\n')).toBeUndefined()
  })
})
