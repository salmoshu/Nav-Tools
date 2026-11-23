import { describe, expect, it } from 'vitest'
import { calculateNmeaChecksum } from '@/core/data/NmeaStreamParser'
import { filterStarRtkSolutionText } from '@/core/gnsslib/StarRtkTimeFilter'

function nmea(body: string): string {
  return `$${body}*${calculateNmeaChecksum(`$${body}`)}`
}

function posEpoch(second: number): string {
  return `2024/07/30 00:00:0${second}.000 31.0 121.0 10.0 1 12`
}

function nmeaEpoch(second: number): string[] {
  const time = `00000${second}.000`
  return [
    nmea(`GNRMC,${time},A,3115.0366,N,12032.0182,E,0.02,358.22,300724,,,A,V`),
    nmea(`GNGGA,${time},3115.0373277,N,12032.0174891,E,4,13,1.0,5.45,M,0.0,M,00,0000`),
  ]
}

describe('StarRTK solution time filtering', () => {
  it('keeps POS headers and only the selected epochs with original line endings', () => {
    const source = `% GPST latitude longitude height Q ns\r\n${[0, 1, 2, 3].map(posEpoch).join('\r\n')}\r\n`
    const filtered = filterStarRtkSolutionText(
      source,
      'llh',
      '2024-07-30T00:00:01',
      '2024-07-30T00:00:02',
    )
    expect(filtered).toBe(
      `% GPST latitude longitude height Q ns\r\n${posEpoch(1)}\r\n${posEpoch(2)}\r\n`,
    )
  })

  it('filters NMEA RMC/GGA pairs together using the RMC date', () => {
    const source = [...nmeaEpoch(0), ...nmeaEpoch(1), ...nmeaEpoch(2)].join('\r\n') + '\r\n'
    const filtered = filterStarRtkSolutionText(
      source,
      'nmea',
      '2024-07-30T00:00:01',
      '2024-07-30T00:00:01.001',
    )
    expect(filtered).toBe(`${nmeaEpoch(1).join('\r\n')}\r\n`)
  })

  it('returns unbounded output unchanged and rejects an empty interval', () => {
    expect(filterStarRtkSolutionText('abc\n', 'llh', '', '')).toBe('abc\n')
    expect(() =>
      filterStarRtkSolutionText('abc\n', 'llh', '2024-07-30T00:00:02', '2024-07-30T00:00:01'),
    ).toThrow('结束时间')
  })
})
