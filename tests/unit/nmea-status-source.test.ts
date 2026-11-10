import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { aggregateStatusSources } from '@/core/status/aggregate'
import { getStatusSources } from '@/core/status/registry'
import { hasStatusData } from '@/core/status/statusValue'
import { useGnssStore } from '@/stores/gnss'

describe('NMEA status source', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it.each(['startup', 'reset'] as const)('keeps GNSS fields empty on %s', (state) => {
    const store = useGnssStore()
    if (state === 'reset') {
      store.status.quality = 4
      store.status.fixMode = 'Fixed'
      store.resetStatus()
    }

    const source = getStatusSources().find((definition) => definition.id === 'gnss')!
    const status = aggregateStatusSources([source], new Set(['gnss']))
    expect(status).toHaveProperty('quality')
    expect(Object.entries(status).filter(([, value]) => hasStatusData(value))).toEqual([])
  })

  it('exposes GNSS fields only in the GNSS application', () => {
    useGnssStore().status.longitude = 121.405266
    useGnssStore().status.latitude = 31.178973

    const source = getStatusSources().find((definition) => definition.id === 'gnss')
    expect(source).toBeDefined()
    // GNSS 应用（含 gnss 模块面板）展示
    expect(aggregateStatusSources([source!], new Set(['gnss']))).toMatchObject({
      longitude: 121.405266,
      latitude: 31.178973,
    })
    // 其它应用一律不展示：Serial/Flow（general+motor 模块视图）、
    // 相机（general）、LiDAR/GNSS-Raw 等——即便数据源在解析 NMEA
    expect(aggregateStatusSources([source!], new Set(['general']))).toEqual({})
    expect(aggregateStatusSources([source!], new Set(['general', 'motor']))).toEqual({})
    expect(aggregateStatusSources([source!], new Set(['lidar', 'general']))).toEqual({})
  })
})
