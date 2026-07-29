import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFlow } from '@/composables/flow/useFlow'
import { isNumericPlotSeries, useDataConfig } from '@/composables/flow/useDataConfig'
import { plotConfigFieldKey } from '@/components/windows/common/plot/plotConfigFields'
import { useFlowStore } from '@/stores/flow'

describe('regex records in the flow pipeline', () => {
  const flow = useFlow()

  beforeEach(() => {
    setActivePinia(createPinia())
    flow.clearRawData()
  })

  it('feeds parsed fields to status and curve consumers in real time', () => {
    flow.addRawData(
      '[ctl] mode=SYS_ERROR speed=LOW(3) dir=FORWARD(1) ult=0.658m angle=0.00 dist=0.40\n',
      'regex',
    )

    expect(flow.flowData.value.rawDataKeys).toEqual([
      'mode',
      'speed',
      'dir',
      'ult',
      'angle',
      'dist',
    ])
    expect(flow.plotData.value.speed).toEqual([3])
    expect(flow.plotData.value.ult).toEqual([0.658])
    expect(useFlowStore().status).toMatchObject({
      mode: 'SYS_ERROR',
      speed: 3,
      dir: 1,
      ult: 0.658,
      angle: 0,
      dist: 0.4,
    })
  })

  it('loads all regex records for charts and aligns missing fields with null', () => {
    flow.initRawData('x=1 y=2\nx=3\nx=5 y=6\n', 'regex')

    expect(flow.flowData.value.isBatchData).toBe(true)
    expect(flow.plotData.value.x).toEqual([1, 3, 5])
    expect(flow.plotData.value.y).toEqual([2, null, 6])
    expect(flow.plotData.value.plotTime).toHaveLength(3)
  })

  it('uses a custom expression consistently', () => {
    flow.addRawData(
      'position(12.5,-4.25)\n',
      'regex',
      String.raw`position\((?<x>[-\d.]+),(?<y>[-\d.]+)\)`,
    )

    expect(flow.plotData.value.x).toEqual([12.5])
    expect(flow.plotData.value.y).toEqual([-4.25])
  })

  it('rounds computed status values to the configured decimal places', () => {
    flow.addRawData('ult=1.24 dist=0.4\n', 'regex')

    useFlowStore().addNewStatus({
      fieldName: 'product',
      decimalPlaces: 2,
      color: '#2c3e50',
      isCodeDefinition: true,
      code: 'ult*dist',
    })

    expect(useFlowStore().status.product).toBe(0.5)
    expect(useFlowStore().status.product.toFixed(2)).toBe('0.50')
  })

  it('uses decimal half-up rounding at binary floating-point boundaries', () => {
    flow.addRawData('value=1.005\n', 'regex')

    useFlowStore().addNewStatus({
      fieldName: 'rounded',
      decimalPlaces: 2,
      color: '#2c3e50',
      isCodeDefinition: true,
      code: 'value',
    })

    expect(useFlowStore().status.rounded).toBe(1.01)
  })

  it('offers only numeric regex fields to Plot and uses the correct default keys', () => {
    flow.addRawData(
      '[ctl] mode=SYS_ERROR speed=HIGH(1) dir=FORWARD(1) ult=0.742m angle=0.00 dist=0.40\n',
      'regex',
      String.raw`(\w+)=([^\s()]+)(?:\((-?\d+(?:\.\d+)?)\))?(?=\s|$)`,
    )

    const config = useDataConfig(flow.plotData)

    expect(useFlowStore().status).toMatchObject({
      mode: 'SYS_ERROR',
      speed: 'HIGH',
      dir: 'FORWARD',
      ult: 0.742,
      angle: 0,
      dist: 0.4,
    })
    expect(config.availableSources.value).toEqual(['ult', 'angle', 'dist'])
    expect(isNumericPlotSeries([null, '1', 2.5])).toBe(true)
    expect(isNumericPlotSeries(['1', 'SYS_ERROR'])).toBe(false)
    expect(plotConfigFieldKey('', 'source', 1)).toBe('source1')
    expect(plotConfigFieldKey('upperLeft', 'source', 1)).toBe('upperLeftSource1')
  })
})
