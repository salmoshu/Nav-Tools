import { describe, expect, it } from 'vitest'
import {
  isSettingsSectionKey,
  settingsSectionForComponent,
} from '@/core/settings/ComponentSettings'

describe('component settings navigation', () => {
  it('routes Messages and Terminal to their dedicated settings', () => {
    expect(settingsSectionForComponent('raw-messages')).toBe('messages')
    expect(settingsSectionForComponent('terminal')).toBe('shortcuts')
    expect(settingsSectionForComponent('gnss-map')).toBe('theme')
  })

  it('accepts only known settings sections', () => {
    expect(isSettingsSectionKey('messages')).toBe(true)
    expect(isSettingsSectionKey('applications')).toBe(true)
    expect(isSettingsSectionKey('unknown')).toBe(false)
    expect(isSettingsSectionKey(undefined)).toBe(false)
  })
})
