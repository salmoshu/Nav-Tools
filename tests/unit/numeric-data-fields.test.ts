import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  getNumericDataFieldNames,
  isConvertibleFiniteNumber,
  isNumericDataSeries,
} from '@/core/data/NumericDataFields'

describe('numeric data field selection', () => {
  it('accepts finite numbers and numeric strings only', () => {
    expect(isConvertibleFiniteNumber(0)).toBe(true)
    expect(isConvertibleFiniteNumber('-12.5')).toBe(true)
    expect(isConvertibleFiniteNumber('SYS_ERROR')).toBe(false)
    expect(isConvertibleFiniteNumber('')).toBe(false)
    expect(isConvertibleFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false)

    expect(isNumericDataSeries([null, '1', 2.5, undefined])).toBe(true)
    expect(isNumericDataSeries(['1', 'FORWARD'])).toBe(false)
    expect(isNumericDataSeries([null, undefined])).toBe(false)
  })

  it('excludes metadata, text, enums, and mixed-value fields', () => {
    expect(
      getNumericDataFieldNames({
        plotTime: [0, 1],
        timestamp: [100, 200],
        rawDataKeys: ['mode', 'speed', 'ult', 'angle'],
        mode: ['SYS_ERROR'],
        speed: ['HIGH'],
        ult: ['0.742', '0.741'],
        angle: [0, 0.01],
        mixed: ['1', 'FORWARD'],
        empty: [null, undefined],
      }),
    ).toEqual(['ult', 'angle'])
  })

  it('is shared by Deviation and StatusView field candidates', () => {
    const deviation = readFileSync('src/components/windows/common/FlowDeviation.vue', 'utf8')
    const statusView = readFileSync('src/components/StatusBar.vue', 'utf8')

    expect(deviation).toContain(
      'const { deviationConfig, availableSources } = useDataConfig(flowData)',
    )
    expect(statusView).toContain('getNumericDataFieldNames(flowData.value)')
  })
})
