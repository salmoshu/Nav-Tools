import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNmea } from '@/composables/gnss/useNmea'
import { calculateNmeaChecksum } from '@/core/data/NmeaStreamParser'

function withChecksum(sentenceWithoutChecksum: string): string {
  return `${sentenceWithoutChecksum}*${calculateNmeaChecksum(sentenceWithoutChecksum)}`
}

describe('GNSS file replay projection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useNmea().clearData()
  })

  it('reveals trajectory points only through the selected replay epoch', () => {
    const nmea = useNmea()
    const samples = [
      ['123519.10', '4807.038', '01131.000'],
      ['123519.20', '4807.039', '01131.001'],
      ['123519.30', '4807.040', '01131.002'],
    ]

    for (const [time, latitude, longitude] of samples) {
      nmea.parseNmea(
        withChecksum(`$GPGGA,${time},${latitude},N,${longitude},E,1,08,0.9,545.4,M,46.9,M,,`),
      )
    }

    expect(nmea.deviationPoints.value).toHaveLength(3)
    expect(nmea.mapTrackPoints.value).toHaveLength(3)

    nmea.prepareTimelineProjection('replay')
    expect(nmea.deviationPoints.value).toHaveLength(0)
    expect(nmea.mapTrackPoints.value).toHaveLength(0)

    nmea.applyTimelineEpoch(0)
    expect(nmea.deviationPoints.value).toHaveLength(1)
    expect(nmea.mapTrackPoints.value).toHaveLength(1)

    nmea.applyTimelineEpoch(2)
    expect(nmea.deviationPoints.value).toHaveLength(3)
    expect(nmea.mapTrackPoints.value).toHaveLength(3)

    nmea.applyTimelineEpoch(1)
    expect(nmea.deviationPoints.value).toHaveLength(2)
    expect(nmea.mapTrackPoints.value).toHaveLength(2)
  })

  it('keeps the full trajectory visible for loaded files', () => {
    const nmea = useNmea()
    for (const time of ['123519.10', '123519.20']) {
      nmea.parseNmea(
        withChecksum(`$GPGGA,${time},4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,`),
      )
    }

    nmea.prepareTimelineProjection('loaded')
    nmea.applyTimelineEpoch(0)

    expect(nmea.deviationPoints.value).toHaveLength(2)
    expect(nmea.mapTrackPoints.value).toHaveLength(2)
  })
})
