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
})
