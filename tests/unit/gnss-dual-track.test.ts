// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  compareTracks,
  computeTrackDifferenceStats,
  parseTrackFile,
  readPrimaryTrackEpochs,
  toDeviationPoints,
  trackSpeedKmh,
  type TrackEpoch,
} from '../../src/core/gnss/DualTrack'
import { calculateNmeaChecksum } from '../../src/core/data/NmeaStreamParser'
import { NumericEpochStore } from '../../src/core/gnss/NumericEpochStore'

function nmea(body: string): string {
  return `$${body}*${calculateNmeaChecksum(`$${body}`)}`
}

function epoch(timeMs: number, latitude = 39.98, longitude = 116.47, height = 60): TrackEpoch {
  return { timeMs, timeLabel: String(timeMs), latitude, longitude, height, quality: 4 }
}

function pos(time: number, latitude: number, longitude: number, height = 60): string {
  const second = String(time).padStart(2, '0')
  return `2024/04/26 03:00:${second}.000 ${latitude.toFixed(9)} ${longitude.toFixed(9)} ${height.toFixed(3)} 1 18 0.01 0.01 0.02 0 0 0 0 0`
}

describe('dual-track file parsing', () => {
  it('parses RTKLIB POS and converts solution quality to the GNSS quality scale', () => {
    const parsed = parseTrackFile(
      `% GPST latitude(deg) longitude(deg) height(m) Q ns\n${pos(0, 39.98, 116.47)}\n${pos(1, 39.98001, 116.47002, 61)}`,
    )
    expect(parsed?.format).toBe('rtklib-pos')
    expect(parsed?.points).toHaveLength(2)
    expect(parsed?.points[0]).toMatchObject({
      timeMs: Date.UTC(2024, 3, 26, 3, 0, 0),
      latitude: 39.98,
      longitude: 116.47,
      quality: 4,
    })
  })

  it('parses GGA, uses the RMC date and does not duplicate the same position epoch', () => {
    const parsed = parseTrackFile(
      [
        nmea('GPGGA,030000.00,3958.800,N,11628.200,E,4,18,0.8,60.5,M,46.9,M,,'),
        nmea('GPRMC,030000.00,A,3958.800,N,11628.200,E,0.0,0.0,260424,,,A'),
        nmea('GPGGA,030001.00,3958.806,N,11628.212,E,5,17,0.9,61.5,M,46.9,M,,'),
      ].join('\n'),
    )
    expect(parsed?.format).toBe('nmea')
    expect(parsed?.points).toHaveLength(2)
    expect(parsed?.points[0]).toMatchObject({
      timeMs: Date.UTC(2024, 3, 26, 3, 0, 0),
      height: 60.5,
      quality: 4,
      speedKmh: 0,
    })
    expect(parsed?.points[0].latitude).toBeCloseTo(39.98, 9)
    expect(parsed?.points[0].longitude).toBeCloseTo(116.47, 9)
  })

  it('accepts RMC-only tracks and rejects bad checksums and invalid fixes', () => {
    const valid = nmea('GPRMC,030000.00,A,3958.800,N,11628.200,E,2.5,0.0,260424,,,R')
    const invalidFix = nmea('GPGGA,030001.00,3958.800,N,11628.200,E,0,0,99.9,0.0,M,0.0,M,,')
    const badChecksum = valid.replace(/\*[0-9A-F]{2}$/, '*00')
    const parsed = parseTrackFile([valid, invalidFix, badChecksum].join('\n'))
    expect(parsed?.points).toHaveLength(1)
    expect(parsed?.points[0].quality).toBe(4)
    expect(parsed?.points[0].height).toBeNull()
  })

  it('rejects out-of-range RTKLIB coordinates', () => {
    expect(parseTrackFile(pos(0, 91, 116.47))?.points).toEqual([])
  })

  it('returns no positions for GSV-only NMEA and null for unsupported text', () => {
    expect(parseTrackFile(nmea('GPGSV,1,1,01,01,40,083,42'))?.points).toEqual([])
    expect(parseTrackFile('not a GNSS track')).toBeNull()
  })
})

describe('track comparison', () => {
  it('uses A first position as a common ENU origin and computes A minus B including height', () => {
    const comparison = compareTracks(
      [epoch(0), epoch(1000, 39.98001, 116.47002, 61)],
      [epoch(0, 39.98, 116.47001, 59), epoch(1000, 39.980005, 116.47001, 59)],
    )!
    expect(comparison.trackA[0].east).toBeCloseTo(0, 9)
    expect(comparison.trackA[0].north).toBeCloseTo(0, 9)
    expect(comparison.trackB[0].east).toBeCloseTo(0.8542, 3)
    expect(comparison.trackB[0].up).toBeCloseTo(-1, 6)
    expect(comparison.differences[0].east).toBeCloseTo(-0.8542, 3)
    expect(comparison.differences[0].up).toBeCloseTo(1, 6)
    expect(comparison.differences[1].east).toBeGreaterThan(0)
    expect(comparison.differences[1].north).toBeGreaterThan(0)
    expect(toDeviationPoints(comparison.differences)).toHaveLength(2)
  })

  it('matches by sorted timestamps with a 25 ms tolerance rather than array index', () => {
    const comparison = compareTracks(
      [epoch(2000), epoch(0), epoch(1000)],
      [epoch(1010), epoch(3000), epoch(0)],
    )!
    expect(comparison.differences.map((point) => point.timeMs)).toEqual([0, 1000])
    expect(compareTracks([epoch(0)], [epoch(26)])?.differences).toEqual([])
  })

  it('recomputes the common origin when A is loaded after B', () => {
    const b = epoch(0, 40, 117)
    const withOnlyB = compareTracks([], [b])!
    expect(withOnlyB.trackB[0].east).toBeCloseTo(0, 9)
    const withBoth = compareTracks([epoch(0)], [b])!
    expect(withBoth.trackA[0].east).toBeCloseTo(0, 9)
    expect(Math.abs(withBoth.trackB[0].north)).toBeGreaterThan(1000)
  })

  it('does not invent a vertical difference when an RMC epoch has no altitude', () => {
    const comparison = compareTracks([epoch(0)], [{ ...epoch(0), height: null }])!
    expect(comparison.differences).toHaveLength(1)
    expect(comparison.differences[0].up).toBeNull()
    expect(comparison.differences[0].east).toBeCloseTo(0, 9)
    const stats = computeTrackDifferenceStats(comparison.differences)!
    expect(stats.meanUp).toBeNull()
    expect(stats.rmsUp).toBeNull()
    expect(stats.stdUp).toBeNull()
  })

  it('returns null for empty tracks and summarizes horizontal and vertical differences', () => {
    expect(compareTracks([], [])).toBeNull()
    const comparison = compareTracks(
      [epoch(0), epoch(1000, 39.98001, 116.47002, 62)],
      [epoch(0), epoch(1000)],
    )!
    const stats = computeTrackDifferenceStats(comparison.differences)!
    expect(stats.count).toBe(2)
    expect(stats.meanEast).toBeCloseTo(comparison.differences[1].east / 2, 9)
    expect(stats.meanNorth).toBeCloseTo(comparison.differences[1].north / 2, 9)
    expect(stats.meanUp).toBeCloseTo(1, 6)
    expect(stats.rmsUp).toBeCloseTo(Math.SQRT2, 6)
    expect(stats.maxHorizontal).toBeCloseTo(
      Math.hypot(comparison.differences[1].east, comparison.differences[1].north),
      9,
    )
    expect(computeTrackDifferenceStats([])).toBeNull()
  })
})

describe('primary track extraction', () => {
  it('reads the existing NMEA track with its absolute altitude and timestamp', () => {
    const map = new NumericEpochStore(['LONGITUDE', 'LATITUDE', 'QUALITY'], {
      valuePrecision: 'float64',
    })
    const position = new NumericEpochStore(['E', 'N', 'U', 'QUALITY'])
    const status = new NumericEpochStore(['DATE', 'ALTITUDE'])
    const time = '2024/04/26 03:00:00.000'
    map.append(time, { LONGITUDE: 116.47, LATITUDE: 39.98, QUALITY: 4 })
    position.append(time, { E: 0, N: 0, U: 0, QUALITY: 4 })
    status.append(time, { DATE: Date.UTC(2024, 3, 26) / 86_400_000, ALTITUDE: 60.5 })

    expect(readPrimaryTrackEpochs(map, position, status)).toEqual([
      expect.objectContaining({
        timeMs: Date.UTC(2024, 3, 26, 3, 0, 0),
        timeLabel: '2024-04-26 03:00:00.000',
        latitude: 39.98,
        longitude: 116.47,
        height: 60.5,
        quality: 4,
      }),
    ])
    expect(readPrimaryTrackEpochs(map, new NumericEpochStore(['U']), status)).toEqual([])
  })

  it('uses the Solver position height when no NMEA status history is provided', () => {
    const map = new NumericEpochStore(['LONGITUDE', 'LATITUDE', 'QUALITY'], {
      valuePrecision: 'float64',
    })
    const position = new NumericEpochStore(['HEIGHT'])
    map.append('03:00:00.000', { LONGITUDE: 116.47, LATITUDE: 39.98, QUALITY: 4 })
    position.append('03:00:00.000', { HEIGHT: 62 })

    expect(readPrimaryTrackEpochs(map, position)).toEqual([
      expect.objectContaining({
        timeMs: 3 * 3_600_000,
        timeLabel: '03:00:00.000',
        height: 62,
      }),
    ])
  })
})

describe('track speed', () => {
  it('keeps RMC speed and derives missing speed from horizontal displacement', () => {
    const points = [{ ...epoch(0), speedKmh: 3.6 }, epoch(2000, 39.98001, 116.47)]
    const speeds = trackSpeedKmh(points)
    expect(speeds[0]).toBe(3.6)
    expect(speeds[1]).toBeCloseTo(1.998635, 6)
    expect(trackSpeedKmh([epoch(0)])[0]).toBeNull()
  })
})
