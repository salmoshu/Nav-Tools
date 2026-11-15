import { describe, expect, it } from 'vitest'
import {
  defaultFormatsForPanels,
  panelDataContract,
  SOLVER_SCOPED_PANEL_IDS,
} from '@/core/panels/PanelDataContract'
import { useAutoFormatSettings } from '@/composables/useAutoFormatSettings'

describe('panel data contracts', () => {
  it('unifies default formats across a custom application without dropping user overrides', () => {
    const expected = ['rtcm3', 'rinex', 'nmea', 'rtklib-pos']
    expect(defaultFormatsForPanels(['gnss-signals', 'gnssraw-frames'])).toEqual(expected)
    expect(
      useAutoFormatSettings().formatsFor('custom', ['gnss-signals', 'gnssraw-frames']),
    ).toEqual(expected)
    expect(defaultFormatsForPanels(['plot'])).toEqual(['json', 'csv'])
    expect(defaultFormatsForPanels(['camera-video'])).toEqual(['nmea', 'rtklib-pos', 'json', 'csv'])
  })

  it('marks dedicated and algorithm panels as excluded from primary-source hints', () => {
    for (const id of [
      'terminal',
      'camera-video',
      'camera-parameters',
      'motor-parameters',
      'gnsslib-solver',
    ]) {
      expect(panelDataContract(id).role).toBe('excluded')
    }
    expect(panelDataContract('raw-messages').formats).toContain('nmea')
    expect(SOLVER_SCOPED_PANEL_IDS.has('raw-messages')).toBe(true)
    expect(SOLVER_SCOPED_PANEL_IDS.has('gnss-deviation')).toBe(true)
  })
})
