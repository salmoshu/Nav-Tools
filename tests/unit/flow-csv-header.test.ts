import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFlow } from '@/composables/flow/useFlow'

describe('CSV batch import with header row', () => {
  const flow = useFlow()

  beforeEach(() => {
    setActivePinia(createPinia())
    flow.clearRawData()
  })

  it('uses header cells as field keys and the time column as timestamps', () => {
    flow.initRawData('time,vx,vy\n0.1,1,2\n0.2,3,4\n', 'csv')

    expect(flow.flowData.value.rawDataKeys).toEqual(['vx', 'vy'])
    expect(flow.plotData.value.vx).toEqual([1, 3])
    expect(flow.plotData.value.vy).toEqual([2, 4])
    expect(flow.plotData.value.plotTime).toEqual([0, 0.1])
  })

  it('keeps 1-based column keys when the first line is data (no header)', () => {
    flow.initRawData('1,2\n3,4\n', 'csv')

    expect(flow.flowData.value.rawDataKeys).toEqual(['1', '2'])
    expect(flow.plotData.value['1']).toEqual([1, 3])
  })

  it('treats a first line with any numeric cell as data, not as a header', () => {
    flow.initRawData('state,1\nstate,2\n', 'csv')

    expect(flow.flowData.value.rawDataKeys).toEqual(['1', '2'])
  })

  it('aligns missing trailing cells with null and ignores empty header cells', () => {
    flow.initRawData('a,,c\n1,2,3\n4,5\n', 'csv')

    // 注意：JS 对象中整数形态 key 永远排在前面，与插入顺序无关
    expect(flow.flowData.value.rawDataKeys).toEqual(['2', 'a', 'c'])
    expect(flow.plotData.value.a).toEqual([1, 4])
    expect(flow.plotData.value.c).toEqual([3, null])
  })

  it('handles quoted fields, escaped quotes and CRLF endings', () => {
    flow.initRawData('name,"val,ue"\r\n"a""b",12.5\r\n"x",-3\r\n', 'csv')

    expect(flow.flowData.value.rawDataKeys).toEqual(['name', 'val,ue'])
    expect(flow.plotData.value.name).toEqual(['a"b', 'x'])
    expect(flow.plotData.value['val,ue']).toEqual([12.5, -3])
  })

  it('dedupes repeated header names with numeric suffixes', () => {
    flow.initRawData('a,a,a\n1,2,3\n', 'csv')

    expect(flow.flowData.value.rawDataKeys).toEqual(['a', 'a_2', 'a_3'])
    expect(flow.plotData.value.a).toEqual([1])
    expect(flow.plotData.value.a_2).toEqual([2])
    expect(flow.plotData.value.a_3).toEqual([3])
  })

  it('falls back to column-number keys for columns beyond the header', () => {
    flow.initRawData('a,b\n1,2,3\n', 'csv')

    // 同上：整数形态 key '3' 排在最前
    expect(flow.flowData.value.rawDataKeys).toEqual(['3', 'a', 'b'])
    expect(flow.plotData.value['3']).toEqual([3])
  })
})
