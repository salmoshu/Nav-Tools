import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationStorage, DEFAULT_APPLICATIONS } from '@/core/application/ApplicationStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'

const enabledKey = 'nav-tools:enabled-default-applications'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('default application preferences', () => {
  it('uses the requested catalog order and enables only the four selected defaults', async () => {
    const { useApplicationSelector } = await import('@/composables/useApplicationSelector')
    const state = useApplicationSelector()

    expect(DEFAULT_APPLICATIONS.map(({ id }) => id)).toEqual([
      'serial',
      'motor',
      'gnss',
      'gnssraw',
      'camera',
      'lidar',
      'gnsslib',
    ])
    expect(state.visibleApplications.value.map(({ id }) => id)).toEqual([
      'serial',
      'gnss',
      'gnssraw',
      'gnsslib',
    ])
    expect(state.isDefaultApplicationEnabled('camera')).toBe(false)
    expect(state.isDefaultApplicationEnabled('lidar')).toBe(false)
  })

  it('persists toggles without losing edited applications or hiding custom applications', async () => {
    const { useApplicationSelector } = await import('@/composables/useApplicationSelector')
    const state = useApplicationSelector()
    const camera = state.applications.value.find(({ id }) => id === 'camera')!
    state.saveApplication({ ...camera, name: 'My Camera', windowIds: ['camera-video'] })
    state.saveApplication({ ...camera, id: 'custom-camera', name: 'Custom Camera' })
    state.setDefaultApplicationEnabled('camera', true)
    expect(state.visibleApplications.value.find(({ id }) => id === 'camera')?.name).toBe(
      'My Camera',
    )

    state.setDefaultApplicationEnabled('camera', false)
    expect(state.visibleApplications.value.some(({ id }) => id === 'camera')).toBe(false)
    expect(state.visibleApplications.value.some(({ id }) => id === 'custom-camera')).toBe(true)
    vi.resetModules()
    const reloaded = (await import('@/composables/useApplicationSelector')).useApplicationSelector()
    expect(reloaded.isDefaultApplicationEnabled('camera')).toBe(false)
    reloaded.setDefaultApplicationEnabled('camera', true)
    expect(reloaded.visibleApplications.value.find(({ id }) => id === 'camera')).toMatchObject({
      name: 'My Camera',
      windowIds: ['camera-video'],
    })
  })

  it('reorders visible cards with the keyboard while retaining hidden application configurations', async () => {
    const { useApplicationSelector } = await import('@/composables/useApplicationSelector')
    const state = useApplicationSelector()
    state.reorderApplications(1, 0)
    expect(state.visibleApplications.value.map(({ id }) => id)).toEqual([
      'gnss',
      'serial',
      'gnssraw',
      'gnsslib',
    ])
    const saved = new ApplicationStorage(new JsonStorage(localStorage)).loadApplications()
    expect(saved.map(({ id }) => id)).toEqual([
      'gnss',
      'motor',
      'serial',
      'gnssraw',
      'camera',
      'lidar',
      'gnsslib',
    ])
  })

  it('persists drag ordering without discarding unchecked applications', async () => {
    const { useApplicationSelector } = await import('@/composables/useApplicationSelector')
    const state = useApplicationSelector()
    state.visibleApplications.value = [...state.visibleApplications.value].reverse()
    state.saveApplicationOrder()
    vi.resetModules()
    const reloaded = (await import('@/composables/useApplicationSelector')).useApplicationSelector()
    expect(reloaded.visibleApplications.value.map(({ id }) => id)).toEqual([
      'gnsslib',
      'gnssraw',
      'gnss',
      'serial',
    ])
    expect(reloaded.applications.value).toHaveLength(7)
    reloaded.setDefaultApplicationEnabled('camera', true)
    expect(reloaded.visibleApplications.value.find(({ id }) => id === 'camera')?.windowIds).toEqual(
      ['camera-video', 'camera-parameters', 'terminal'],
    )
  })

  it('can restore a deleted built-in application by checking its settings card', async () => {
    const { useApplicationSelector } = await import('@/composables/useApplicationSelector')
    const state = useApplicationSelector()
    state.deleteApplication('gnss')
    expect(state.isDefaultApplicationEnabled('gnss')).toBe(false)
    state.setDefaultApplicationEnabled('gnss', true)
    expect(state.isDefaultApplicationEnabled('gnss')).toBe(true)
    expect(state.visibleApplications.value.map(({ id }) => id)).toEqual([
      'serial',
      'gnss',
      'gnssraw',
      'gnsslib',
    ])
  })

  it('retains an explicitly empty selection and ignores unknown or repeated ids', () => {
    const storage = new ApplicationStorage(new JsonStorage(localStorage))
    storage.saveEnabledDefaultApplicationIds([])
    expect(storage.loadEnabledDefaultApplicationIds()).toEqual([])
    storage.saveEnabledDefaultApplicationIds(['camera', 'missing', 'serial', 'camera'])
    expect(storage.loadEnabledDefaultApplicationIds()).toEqual(['serial', 'camera'])
  })

  it('falls back to the selected defaults if the saved preferences are malformed', () => {
    localStorage.setItem(enabledKey, '{broken')
    const storage = new ApplicationStorage(new JsonStorage(localStorage))
    expect(storage.loadEnabledDefaultApplicationIds()).toEqual([
      'serial',
      'gnss',
      'gnssraw',
      'gnsslib',
    ])
  })
})
