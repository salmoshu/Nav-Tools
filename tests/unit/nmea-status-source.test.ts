import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { aggregateStatusSources } from '@/core/status/aggregate'
import { getStatusSources } from '@/core/status/registry'
import { hasStatusData } from '@/core/status/statusValue'
import { useDataSourceManager } from '@/composables/useDataSourceManager'
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

  it('exposes GNSS fields in any application when NMEA is selected', () => {
    const { settings } = useDataSourceManager()
    settings.activeSource = 'serial'
    settings.serial.parser = 'nmea'
    useGnssStore().status.longitude = 121.405266
    useGnssStore().status.latitude = 31.178973

    const source = getStatusSources().find((definition) => definition.id === 'gnss')
    expect(source).toBeDefined()
    expect(aggregateStatusSources([source!], new Set(['general']))).toMatchObject({
      longitude: 121.405266,
      latitude: 31.178973,
    })
  })

  it('does not expose GNSS fields for another format outside the GNSS application', () => {
    const { settings } = useDataSourceManager()
    settings.activeSource = 'serial'
    settings.serial.parser = 'json'

    const source = getStatusSources().find((definition) => definition.id === 'gnss')
    expect(source).toBeDefined()
    expect(aggregateStatusSources([source!], new Set(['general']))).toEqual({})
    expect(aggregateStatusSources([source!], new Set(['gnss']))).toHaveProperty('longitude')
  })
})
