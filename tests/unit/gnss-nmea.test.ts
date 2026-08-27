import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNmea } from '@/composables/gnss/useNmea'
import { useGnssStore } from '@/stores/gnss'
import { calculateNmeaChecksum } from '@/core/data/NmeaStreamParser'

function withChecksum(sentenceWithoutChecksum: string): string {
  return `${sentenceWithoutChecksum}*${calculateNmeaChecksum(sentenceWithoutChecksum)}`
}

describe('NMEA GNSS status extraction', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useNmea().clearData()
  })

  it('extracts velocity from RMC and visible satellites from GSV', () => {
    const { processRawData } = useNmea()
    const store = useGnssStore()

    const gga = withChecksum('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')
    const rmc = withChecksum('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W')
    const gsv = withChecksum('$GPGSV,2,1,08,01,40,083,46,02,17,308,41,03,18,099,44,04,12,250,32')

    processRawData(`${gga}\n${rmc}\n${gsv}\n`)

    expect(store.status.velocity).toBe((22.4 * 1.852).toFixed(2))
    expect(store.status.satsVisible).toBe('08')
    expect(store.status.satsUsed).toBe('08')
  })

  it('extracts 2D/3D accuracy from GST', () => {
    const { processRawData } = useNmea()
    const store = useGnssStore()

    const gst = withChecksum('$GPGST,123519,0.023,0.012,0.011,123.4,0.021,0.018,0.031')
    processRawData(`${gst}\n`)

    expect(store.status.twoDAcc).toBe('0.03')
    expect(store.status.threeDAcc).toBe('0.04')
  })

  it('does not overwrite GSA/GSV derived fields with Invalid on every GGA', () => {
    const { processRawData } = useNmea()
    const store = useGnssStore()

    const gsa = withChecksum('$GPGSA,A,3,04,05,,09,12,,,24,,,,,2.5,1.3,2.1')
    const gsv = withChecksum('$GPGSV,2,1,08,01,40,083,46,02,17,308,41,03,18,099,44,04,12,250,32')
    const gga = withChecksum('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')

    processRawData(`${gsa}\n${gsv}\n${gga}\n`)

    expect(store.status.PDOP).toBe('2.5')
    expect(store.status.satsVisible).toBe('08')
  })

  it('preserves fractional GGA seconds in current data and GNSS status', () => {
    const { currentData, parseNmea } = useNmea()
    const store = useGnssStore()
    const rmc = withChecksum('$GPRMC,123519.00,A,4807.038,N,01131.000,E,0.0,0.0,230394,003.1,W')
    const gga30 = withChecksum('$GPGGA,123519.30,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')
    const gga40 = withChecksum('$GPGGA,123519.40,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')

    parseNmea(rmc)
    parseNmea(gga30)
    expect(currentData.value.time).toMatch(/12:35:19\.300$/)
    expect(store.status.utcTime).toMatch(/12:35:19\.300$/)

    parseNmea(gga40)
    expect(currentData.value.time).toMatch(/12:35:19\.400$/)
    expect(store.status.utcTime).toMatch(/12:35:19\.400$/)
  })

  it('records 10 Hz position and speed histories and coalesces matching VTG speed', () => {
    const { parseNmea, positionEpochHistory, speedEpochHistory } = useNmea()
    const rmc30 = withChecksum('$GPRMC,123519.30,A,4807.038,N,01131.000,E,10.0,0.0,230394,003.1,W')
    const gga30 = withChecksum('$GPGGA,123519.30,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')
    const vtg30 = withChecksum('$GPVTG,0.0,T,,M,0.0,N,12.3,K,A')
    const rmc40 = withChecksum('$GPRMC,123519.40,A,4807.039,N,01131.001,E,20.0,0.0,230394,003.1,W')
    const gga40 = withChecksum('$GPGGA,123519.40,4807.039,N,01131.001,E,1,08,0.9,546.4,M,46.9,M,,')

    ;[rmc30, gga30, vtg30, rmc40, gga40].forEach(parseNmea)

    expect(positionEpochHistory.value.length).toBe(2)
    expect(positionEpochHistory.value.getValue('U', 0)).toBeCloseTo(0)
    expect(positionEpochHistory.value.getValue('U', 1)).toBeCloseTo(1)
    expect(speedEpochHistory.value.length).toBe(2)
    expect(speedEpochHistory.value.getValue('SPEED', 0)).toBeCloseTo(12.3)
    expect(speedEpochHistory.value.getValue('SPEED', 1)).toBeCloseTo(20 * 1.852)
    expect(speedEpochHistory.value.formatTime(1)).toBe('12:35:19.400')
  })

  it('records one status snapshot per 10 Hz epoch and restores a selected epoch', () => {
    const { parseNmea, statusEpochHistory, applyStatusEpoch, clearData } = useNmea()
    const store = useGnssStore()
    const rmc30 = withChecksum('$GPRMC,123519.30,A,4807.038,N,01131.000,E,10.0,0.0,230394,003.1,W')
    const gga30 = withChecksum('$GPGGA,123519.30,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')
    const rmc40 = withChecksum('$GPRMC,123519.40,A,4807.039,N,01131.001,E,20.0,0.0,230394,003.1,W')
    const gga40 = withChecksum('$GPGGA,123519.40,4807.039,N,01131.001,E,1,09,0.8,546.4,M,46.9,M,,')

    ;[rmc30, gga30, rmc40, gga40].forEach(parseNmea)

    expect(statusEpochHistory.value.length).toBe(2)
    expect(statusEpochHistory.value.duration).toBe(100)

    applyStatusEpoch(0)
    expect(store.status.utcTime).toBe('2094/03/23 12:35:19.300')
    expect(store.status.velocity).toBe((10 * 1.852).toFixed(2))
    expect(store.status.satsUsed).toBe('8')

    applyStatusEpoch(1)
    expect(store.status.utcTime).toBe('2094/03/23 12:35:19.400')
    expect(store.status.velocity).toBe((20 * 1.852).toFixed(2))
    expect(store.status.satsUsed).toBe('9')

    clearData()
    expect(statusEpochHistory.value.length).toBe(0)
    expect(store.status.utcTime).toBe('')
    expect(store.status.longitude).toBe('')
  })

  it('coalesces matching RMC and GGA map positions with GGA solution quality', () => {
    const { parseNmea, mapTrackPoints, speedEpochHistory, rebuildMapTrackFromPositionHistory } =
      useNmea()
    const store = useGnssStore()
    const rmc30 = withChecksum(
      '$GPRMC,091214.30,A,3110.7353943,N,12124.3158362,E,1.26,0.00,030723,0.0,E,R,V',
    )
    const gga30 = withChecksum(
      '$GPGGA,091214.30,3110.7353943,N,12124.3158362,E,5,15,1.0,5.754,M,10.841,M,0.2,0000',
    )
    const gga40 = withChecksum(
      '$GPGGA,091214.40,3110.7354639,N,12124.3157707,E,4,15,1.0,5.751,M,10.841,M,0.3,0000',
    )
    const rmc40 = withChecksum(
      '$GPRMC,091214.40,A,3110.7354639,N,12124.3157707,E,1.20,0.00,030723,0.0,E,R,V',
    )

    parseNmea(rmc30)
    parseNmea(gga30)
    parseNmea(gga40)
    parseNmea(rmc40)

    expect(mapTrackPoints.value).toHaveLength(2)
    expect(mapTrackPoints.value.map((point) => point[2])).toEqual([5, 4])
    expect(speedEpochHistory.value.getValue('QUALITY', 0)).toBe(5)
    expect(speedEpochHistory.value.getValue('QUALITY', 1)).toBe(4)
    expect(store.status.quality).toBe(4)

    rebuildMapTrackFromPositionHistory()
    expect(mapTrackPoints.value).toHaveLength(2)
    expect(mapTrackPoints.value.map((point) => point[2])).toEqual([5, 4])
  })

  it('keeps RMC-only map tracks and maps their mode to the shared solution quality', () => {
    const { parseNmea, mapTrackPoints } = useNmea()
    const store = useGnssStore()
    const rmc = withChecksum(
      '$GPRMC,091214.30,A,3110.7353943,N,12124.3158362,E,1.26,0.00,030723,0.0,E,R,V',
    )

    parseNmea(rmc)

    expect(mapTrackPoints.value).toHaveLength(1)
    expect(mapTrackPoints.value[0][0]).toBeCloseTo(121 + 24.3158362 / 60, 10)
    expect(mapTrackPoints.value[0][1]).toBeCloseTo(31 + 10.7353943 / 60, 10)
    expect(mapTrackPoints.value[0][2]).toBe(4)
    expect(store.status.quality).toBe(4)
  })

  it('builds a bounded map overview from full-precision position history', () => {
    const { processRawData, mapTrackPoints, rebuildMapTrackFromPositionHistory } = useNmea()
    const lines = Array.from({ length: 10 }, (_, index) =>
      withChecksum(
        `$GPGGA,12000${index}.0,4807.${String(38000 + index).padStart(5, '0')},N,01131.${String(index).padStart(5, '0')},E,1,08,0.9,545.4,M,46.9,M,,`,
      ),
    )
    processRawData(`${lines.join('\n')}\n`)
    rebuildMapTrackFromPositionHistory(3)

    expect(mapTrackPoints.value).toHaveLength(3)
    expect(mapTrackPoints.value[0][0]).toBeCloseTo(11 + 31 / 60, 10)
    expect(mapTrackPoints.value[0][1]).toBeCloseTo(48 + 7.38 / 60, 10)
    expect(mapTrackPoints.value.at(-1)?.[0]).toBeCloseTo(11 + 31.00009 / 60, 10)
    expect(mapTrackPoints.value.at(-1)?.[1]).toBeCloseTo(48 + 7.38009 / 60, 10)
  })

  it('builds an extrema-preserving deviation overview spanning the complete position history', () => {
    const { positionEpochHistory, deviationPoints, rebuildDeviationFromPositionHistory } = useNmea()
    for (let index = 0; index < 10; index += 1) {
      positionEpochHistory.value.append(`12000${index}.0`, {
        E: index === 3 ? 100 : index,
        N: index === 7 ? -50 : index,
        U: 0,
        QUALITY: 4,
      })
    }

    rebuildDeviationFromPositionHistory(6)

    expect(deviationPoints.value.length).toBeLessThanOrEqual(6)
    expect(deviationPoints.value[0]).toEqual([0, 0, 4])
    expect(deviationPoints.value.at(-1)).toEqual([9, 9, 4])
    expect(deviationPoints.value.some(([east]) => east === 100)).toBe(true)
    expect(deviationPoints.value.some(([, north]) => north === -50)).toBe(true)
  })

  it('retains all epochs from a bulk non-playback import before view-level LOD', () => {
    const nmea = useNmea()
    const lines = Array.from({ length: 600 }, (_, index) => {
      const totalTenths = index
      const seconds = Math.floor(totalTenths / 10)
      const hh = 12 + Math.floor(seconds / 3600)
      const mm = Math.floor(seconds / 60) % 60
      const ss = seconds % 60
      const tenth = totalTenths % 10
      const time = `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}${String(ss).padStart(2, '0')}.${tenth}`
      const latitude = (4807.038 + index * 0.00001).toFixed(5)
      const longitude = (1131 + index * 0.00001).toFixed(5)
      return withChecksum(`$GPGGA,${time},${latitude},N,0${longitude},E,4,12,0.8,545.4,M,46.9,M,,`)
    })

    nmea.beginBulkImport()
    nmea.processRawData(`${lines.join('\n')}\n`)
    nmea.rebuildMapTrackFromPositionHistory()
    nmea.rebuildDeviationFromPositionHistory()
    nmea.endBulkImport()

    expect(nmea.positionEpochHistory.value.length).toBe(600)
    expect(nmea.statusEpochHistory.value.length).toBe(600)
    expect(nmea.deviationPoints.value.length).toBe(600)
    expect(nmea.mapTrackPoints.value.length).toBe(600)
  })

  it('records every fractional-second GGA epoch from complete GSV cycles', () => {
    const { processRawData, satelliteEpochHistory } = useNmea()
    const lines = [
      withChecksum('$GPGSV,2,1,05,01,40,083,46,02,17,308,41,03,18,099,44,04,12,250,32'),
      withChecksum('$GPGSV,2,2,05,05,30,180,38'),
      withChecksum('$GAGSV,1,1,02,08,38,253,40,15,71,293,42'),
      withChecksum(
        '$GPGGA,091214.30,3110.7353943,N,12124.3158362,E,5,05,1.0,5.754,M,10.841,M,0.2,0000',
      ),
      withChecksum('$GPGSV,1,1,01,01,40,083,46'),
      withChecksum(
        '$GPGGA,091214.40,3110.7354639,N,12124.3157707,E,5,01,1.0,5.751,M,10.841,M,0.3,0000',
      ),
    ]

    processRawData(`${lines.join('\n')}\n`)

    expect(satelliteEpochHistory.value.length).toBe(2)
    expect(satelliteEpochHistory.value.getSample(0)).toMatchObject({
      time: '09:12:14.300',
      total: 7,
      complete: true,
    })
    expect(satelliteEpochHistory.value.getSample(0).counts).toMatchObject({
      GPS: 5,
      GALILEO: 2,
    })
    expect(satelliteEpochHistory.value.getSample(1)).toMatchObject({
      time: '09:12:14.400',
      total: 1,
      complete: true,
    })
  })

  it('restores satellite details for the time selected by the file timeline', () => {
    const nmea = useNmea()
    const lines = [
      withChecksum('$GPGSV,1,1,01,01,40,083,46'),
      withChecksum(
        '$GPGGA,091214.30,3110.7353943,N,12124.3158362,E,5,01,1.0,5.754,M,10.841,M,0.2,0000',
      ),
      withChecksum('$GPGSV,1,1,01,07,30,180,38'),
      withChecksum(
        '$GPGGA,091214.40,3110.7354639,N,12124.3157707,E,5,01,1.0,5.751,M,10.841,M,0.3,0000',
      ),
    ]

    nmea.processRawData(`${lines.join('\n')}\n`)
    expect(nmea.satelliteDetailEpochHistory.length).toBe(2)

    nmea.applyTimelineEpoch(0)
    expect(nmea.satelliteSnrData.value.map((item) => item.prn)).toEqual(['1'])

    nmea.applyTimelineEpoch(1)
    expect(nmea.satelliteSnrData.value.map((item) => item.prn)).toEqual(['7'])
  })

  it('creates the same epoch history regardless of input chunking', () => {
    const nmea = useNmea()
    const lines = [
      withChecksum('$GPGSV,1,1,02,01,40,083,46,02,17,308,41'),
      withChecksum(
        '$GPGGA,091214.30,3110.7353943,N,12124.3158362,E,5,02,1.0,5.754,M,10.841,M,0.2,0000',
      ),
      withChecksum('$GPGSV,1,1,01,01,40,083,46'),
      withChecksum(
        '$GPGGA,091214.40,3110.7354639,N,12124.3157707,E,5,01,1.0,5.751,M,10.841,M,0.3,0000',
      ),
    ]

    nmea.processRawData(`${lines.join('\n')}\n`)
    const batched = Array.from({ length: nmea.satelliteEpochHistory.value.length }, (_, index) =>
      nmea.satelliteEpochHistory.value.getSample(index),
    )

    nmea.clearData()
    for (const line of lines) nmea.processRawData(`${line}\n`)

    const streamed = Array.from({ length: nmea.satelliteEpochHistory.value.length }, (_, index) =>
      nmea.satelliteEpochHistory.value.getSample(index),
    )
    expect(streamed).toEqual(batched)
  })
})
