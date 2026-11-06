import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDefaultInjectionSettings,
  DataInjectionStorage,
  DATA_INJECTION_SETTINGS_KEY,
  validateInjectionSettings,
} from '@/core/data/DataInjection'
import { JsonStorage } from '@/core/storage/JsonStorage'

beforeEach(() => localStorage.clear())
describe('data injection settings', () => {
  it('saves B independently from A and retains connection options without persisting the password', () => {
    localStorage.setItem('nav-tools:data-source-settings', 'unchanged-A')
    const settings = createDefaultInjectionSettings()
    Object.assign(settings.network, {
      host: 'cors.example.com',
      mountpoint: 'RTCM3',
      username: 'rover',
      password: 'secret',
    })
    const storage = new DataInjectionStorage(new JsonStorage(localStorage))
    storage.save(settings)
    expect(storage.load().network).toMatchObject({
      host: 'cors.example.com',
      mountpoint: 'RTCM3',
      username: 'rover',
      password: '',
    })
    expect(localStorage.getItem(DATA_INJECTION_SETTINGS_KEY)).not.toContain('secret')
    expect(localStorage.getItem('nav-tools:data-source-settings')).toBe('unchanged-A')
  })

  it('validates caster configuration before opening a socket', () => {
    const settings = createDefaultInjectionSettings()
    expect(validateInjectionSettings(settings)).toContain('host')
    settings.network.host = 'caster'
    expect(validateInjectionSettings(settings)).toContain('mountpoint')
    settings.network.mountpoint = 'RTCM3\r\nInjected: header'
    expect(validateInjectionSettings(settings)).toContain('mountpoint')
    settings.network.mountpoint = 'RTCM3'
    expect(validateInjectionSettings(settings)).toBeUndefined()
    settings.network.port = 65536
    expect(validateInjectionSettings(settings)).toContain('65535')
  })
})
