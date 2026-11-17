import { beforeEach, describe, expect, it } from 'vitest'
import { usePersistentSelection } from '@/composables/usePersistentSelection'

const STORAGE_KEY = 'nav-tools:view-selections:v1'

describe('persistent view selections', () => {
  beforeEach(() => localStorage.clear())

  it('restores a selected view and persists subsequent changes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'gnss-signal:view': 'chart' }))
    const view = usePersistentSelection('gnss-signal:view', 'nsat', [
      'nsat',
      'table',
      'chart',
      'persat',
    ])
    expect(view.value).toBe('chart')
    view.value = 'table'
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)['gnss-signal:view']).toBe('table')
  })

  it('falls back when a stored value is no longer available', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'gnss-signal:view': 'removed-view' }))
    const view = usePersistentSelection('gnss-signal:view', 'nsat', ['nsat', 'chart'])
    expect(view.value).toBe('nsat')
  })

  it('supports numeric filter values', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'gnssraw-snr:filter': 2 }))
    const filter = usePersistentSelection('gnssraw-snr:filter', 0, () => [0, 2, 3])
    expect(filter.value).toBe(2)
    filter.value = 3
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)['gnssraw-snr:filter']).toBe(3)
  })
})
