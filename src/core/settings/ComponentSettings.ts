export const SETTINGS_SECTION_KEYS = [
  'theme',
  'language',
  'applications',
  'messages',
  'shortcuts',
  'version',
] as const

export type SettingsSectionKey = (typeof SETTINGS_SECTION_KEYS)[number]

export function isSettingsSectionKey(value: unknown): value is SettingsSectionKey {
  return typeof value === 'string' && (SETTINGS_SECTION_KEYS as readonly string[]).includes(value)
}

export function settingsSectionForComponent(windowId: string): SettingsSectionKey {
  if (windowId === 'raw-messages') return 'messages'
  if (windowId === 'terminal') return 'shortcuts'
  return 'theme'
}
