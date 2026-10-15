import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNmea } from '@/composables/gnss/useNmea'
import { calculateNmeaChecksum } from '@/core/data/NmeaStreamParser'
import {
  SnrHistoryStore,
  formatSnrEpochLabel,
  snrHistoryKey,
} from '@/core/gnss/SnrHistoryStore'
import { assignSnrSeriesColors, shiftHexLightness } from '@/core/gnss/SnrSeriesColors'

function withChecksum(sentenceWithoutChecksum: string): string {
  return `${sentenceWithoutChecksum}*${calculateNmeaChecksum(sentenceWithoutChecksum)}`
}

describe('SnrHistoryStore', () => {
  it('aligns per-satellite series with epochs and marks absent satellites as null', () => {
    const store = new SnrHistoryStore(10)
    store.appendEpoch('123519', [
      { constellation: 'GPS', prn: '12', snr: 45 },
      { constellation: 'BEIDOU', prn: '5', snr: 38 },
    ])
    store.appendEpoch('123520', [{ constellation: 'GPS', prn: '12', snr: 46 }])

    expect(store.length).toBe(2)
    expect(store.getEpochTimes()).toEqual(['123519', '123520'])
    expect(store.getSeries('GPS-12').map((p) => p.snr)).toEqual([45, 46])
    expect(store.getSeries('BEIDOU-5').map((p) => p.snr)).toEqual([38, null])
  })

  it('replaces the last epoch when the same logical time is recommitted', () => {
    const store = new SnrHistoryStore(10)
    store.appendEpoch('123519', [{ constellation: 'GPS', prn: '12', snr: 45 }])
    store.appendEpoch('123519', [{ constellation: 'BEIDOU', prn: '5', snr: 40 }])

    expect(store.length).toBe(1)
    expect(store.getSeries('GPS-12').map((p) => p.snr)).toEqual([null])
    expect(store.getSeries('BEIDOU-5').map((p) => p.snr)).toEqual([40])
  })

  it('bounds the history to its capacity and prunes satellites outside the window', () => {
    const store = new SnrHistoryStore(3)
    store.appendEpoch('t1', [{ constellation: 'GPS', prn: '12', snr: 45 }])
    store.appendEpoch('t2', [{ constellation: 'GPS', prn: '12', snr: 46 }])
    store.appendEpoch('t3', [{ constellation: 'GPS', prn: '12', snr: 47 }])
    store.appendEpoch('t4', [{ constellation: 'GPS', prn: '20', snr: 30 }])

    expect(store.length).toBe(3)
    expect(store.getEpochTimes()).toEqual(['t2', 't3', 't4'])
    expect(store.getSeries('GPS-12').map((p) => p.snr)).toEqual([46, 47, null])

    // GPS-12 不再出现，再滑入两个历元后其窗口内全为 null，被清理
    store.appendEpoch('t5', [{ constellation: 'GPS', prn: '20', snr: 31 }])
    store.appendEpoch('t6', [{ constellation: 'GPS', prn: '20', snr: 32 }])
    expect(store.has('GPS-12')).toBe(false)
    expect(store.getSeries('GPS-12')).toEqual([])
    expect(store.keys).toEqual(['GPS-20'])
  })

  it('sorts keys by constellation then numeric PRN', () => {
    const store = new SnrHistoryStore(10)
    store.appendEpoch('t1', [
      { constellation: 'GPS', prn: '20', snr: 40 },
      { constellation: 'BEIDOU', prn: '5', snr: 40 },
      { constellation: 'GPS', prn: '3', snr: 40 },
    ])
    expect(store.keys).toEqual(['BEIDOU-5', 'GPS-3', 'GPS-20'])
  })

  it('ignores empty times and clears completely', () => {
    const store = new SnrHistoryStore(10)
    store.appendEpoch('', [{ constellation: 'GPS', prn: '12', snr: 45 }])
    expect(store.length).toBe(0)

    store.appendEpoch('t1', [{ constellation: 'GPS', prn: '12', snr: 45 }])
    store.clear()
    expect(store.length).toBe(0)
    expect(store.keys).toEqual([])
  })
})

describe('snrHistoryKey / formatSnrEpochLabel', () => {
  it('builds stable satellite keys', () => {
    expect(snrHistoryKey('GPS', 12)).toBe('GPS-12')
    expect(snrHistoryKey('BEIDOU', '5')).toBe('BEIDOU-5')
  })

  it('formats compact, colon and datetime epoch labels as HH:MM:SS', () => {
    expect(formatSnrEpochLabel('123519')).toBe('12:35:19')
    expect(formatSnrEpochLabel('123519.40')).toBe('12:35:19')
    expect(formatSnrEpochLabel('12:35:19.400')).toBe('12:35:19')
    expect(formatSnrEpochLabel('2026/10/15 12:35:19.400')).toBe('12:35:19')
  })
})

describe('assignSnrSeriesColors', () => {
  it('keeps unique constellation base colors unchanged', () => {
    const colors = assignSnrSeriesColors(['GPS-12', 'BEIDOU-5'], (key) =>
      key.startsWith('GPS') ? '#52c41a' : '#faad14',
    )
    expect(colors.get('GPS-12')).toBe('#52c41a')
    expect(colors.get('BEIDOU-5')).toBe('#faad14')
  })

  it('staggers lightness for series sharing a base color', () => {
    const colors = assignSnrSeriesColors(['GPS-3', 'GPS-12', 'GPS-20'], () => '#52c41a')
    const assigned = ['GPS-3', 'GPS-12', 'GPS-20'].map((key) => colors.get(key))
    expect(new Set(assigned).size).toBe(3)
    // 中间序号为 step 0，保持星座基色
    expect(colors.get('GPS-12')).toBe('#52c41a')
  })

  it('shiftHexLightness is clamped and preserves alpha suffix or unknown formats', () => {
    expect(shiftHexLightness('#52c41a', 0)).toBe('#52c41a')
    expect(shiftHexLightness('#52c41a66', 1)).toMatch(/^#[0-9a-f]{6}66$/)
    expect(shiftHexLightness('red', 1)).toBe('red')
  })
})

describe('useNmea per-satellite SNR history', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useNmea().clearData()
  })

  it('accumulates per-epoch SNR per satellite from GSV blocks committed by GGA', () => {
    const { parseNmea, snrHistory } = useNmea()
    const gsv1 = withChecksum('$GPGSV,1,1,02,01,40,083,46,12,20,100,38')
    const gga1 = withChecksum('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')
    const gsv2 = withChecksum('$GPGSV,1,1,02,01,41,083,50,12,20,100,39')
    const gga2 = withChecksum('$GPGGA,123520,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')

    ;[gsv1, gga1, gsv2, gga2].forEach(parseNmea)

    expect(snrHistory.value.length).toBe(2)
    expect(snrHistory.value.getEpochTimes()).toEqual(['123519', '123520'])
    expect(snrHistory.value.getSeries('GPS-1').map((p) => p.snr)).toEqual([46, 50])
    expect(snrHistory.value.getSeries('GPS-12').map((p) => p.snr)).toEqual([38, 39])
  })

  it('coalesces recommitted epochs and clears together with the satellite history', () => {
    const { parseNmea, snrHistory, clearSatelliteEpochHistory } = useNmea()
    const gsv = withChecksum('$GPGSV,1,1,01,01,40,083,46')
    const gga = withChecksum('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,')

    ;[gsv, gga, gsv, gga].forEach(parseNmea)
    expect(snrHistory.value.length).toBe(1)

    clearSatelliteEpochHistory()
    expect(snrHistory.value.length).toBe(0)
  })
})

describe('GNSS signal per-satellite SNR view wiring', () => {
  const source = readFileSync('src/components/windows/gnss/GnssSignal.vue', 'utf8')
  const nmea = readFileSync('src/composables/gnss/useNmea.ts', 'utf8')

  it('registers a per-satellite view with a bounded multi-select', () => {
    expect(source).toContain('value="persat"')
    expect(source).toContain("t('gnss.signal.perSatView')")
    expect(source).toContain('v-model="selectedSatKeys"')
    expect(source).toContain(':multiple-limit="MAX_PER_SAT_SELECTION"')
  })

  it('renders one line series per selected satellite from the rolling history', () => {
    expect(source).toContain("type: 'line'")
    expect(source).toContain('history.getSeries(key).map((point) => point.snr)')
    expect(source).toContain('formatSnrEpochLabel')
    expect(source).toContain('connectNulls: false')
  })

  it('enters the per-satellite view by clicking a bar in the overview chart', () => {
    expect(source).toContain("chartInstance.value.on('click', handleBarClick)")
    expect(source).toContain('snrHistoryKey(data.constellation, data.prn)')
    expect(source).toContain("currentView.value = 'persat'")
  })

  it('staggers lightness for same-constellation selections', () => {
    expect(source).toContain('assignSnrSeriesColors')
  })

  it('shows an empty state when nothing is selected or no history exists', () => {
    expect(source).toContain('perSatEmpty')
    expect(source).toContain("t('gnss.signal.perSatNoHistory')")
    expect(source).toContain("t('gnss.signal.perSatEmptyHint')")
  })

  it('feeds the rolling history from the GGA epoch commit in useNmea', () => {
    expect(nmea).toContain("import { SnrHistoryStore } from '@/core/gnss/SnrHistoryStore'")
    expect(nmea).toContain('snrHistory.value.appendEpoch(rawGgaTime, details ?? [])')
    expect(nmea).toContain('snrHistory.value.clear()')
  })

  it('defines the new i18n keys in both locales', () => {
    const zh = readFileSync('src/i18n/locales/zh-CN/gnss.ts', 'utf8')
    const en = readFileSync('src/i18n/locales/en-US/gnss.ts', 'utf8')
    for (const key of [
      'perSatView',
      'selectSatellites',
      'perSatNoHistory',
      'perSatEmptyTitle',
      'perSatEmptyHint',
    ]) {
      expect(zh).toContain(`${key}:`)
      expect(en).toContain(`${key}:`)
    }
  })
})
