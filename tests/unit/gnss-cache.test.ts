import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNmea } from '@/composables/gnss/useNmea'

describe('GNSS cache clearing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useNmea().clearData()
  })

  it('removes buffered tracks and starts the next track from a clean state', () => {
    const nmea = useNmea()
    const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47\r\n'

    nmea.processRawData(sentence)
    expect(nmea.nmeaData.value).toHaveLength(1)

    nmea.clearData()
    expect(nmea.nmeaData.value).toHaveLength(0)

    nmea.processRawData(sentence)
    expect(nmea.nmeaData.value).toHaveLength(1)
  })

  it('appends track points without copying the complete history array', () => {
    const nmea = useNmea()
    const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47\r\n'

    nmea.processRawData(sentence)
    const history = nmea.nmeaData.value
    nmea.processRawData(sentence)

    expect(nmea.nmeaData.value).toBe(history)
    expect(nmea.nmeaData.value).toHaveLength(2)
  })

  it('maintains an incremental deviation point cache and clears it with GNSS data', () => {
    const nmea = useNmea()
    const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47\r\n'

    nmea.processRawData(sentence)
    const points = nmea.deviationPoints.value
    nmea.processRawData(sentence)

    expect(nmea.deviationPoints.value).toBe(points)
    expect(points).toHaveLength(2)
    expect(points[0]).toEqual([0, 0, 1])

    nmea.clearData()
    expect(nmea.deviationPoints.value).toHaveLength(0)
  })

  it('retains every precise map coordinate from a batched GGA update', () => {
    const nmea = useNmea()
    const sentence = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47\r\n'
    const points = nmea.mapTrackPoints.value

    nmea.processRawData(sentence.repeat(3))

    expect(nmea.mapTrackPoints.value).toBe(points)
    expect(points).toHaveLength(3)
    expect(points[0][0]).toBeCloseTo(11.5166666667)
    expect(points[0][1]).toBeCloseTo(48.1173)

    nmea.clearData()
    expect(nmea.mapTrackPoints.value).toHaveLength(0)
  })

  it('coalesces repeated satellite reports into the latest satellite snapshot', () => {
    const nmea = useNmea()
    const sentence =
      '$GPGSV,1,1,03,13,50,034,00,18,42,315,00,24,40,179,00,,,,,0*53\r\n'

    nmea.processRawData(sentence.repeat(100))

    expect(nmea.satelliteSnrData.value).toHaveLength(3)
    expect(nmea.satelliteSnrData.value.map((item) => item.prn)).toEqual([13, 18, 24])
  })
})
