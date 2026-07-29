import type { UserApplication } from '@/settings/config'
import type { StorageLike } from '@/core/storage/JsonStorage'

const LAYOUT_STORAGE_PREFIX = 'nav-tools:layout'

const JSON_SETTING_KEYS = {
  dataSource: 'nav-tools:data-source-settings',
  cameraVideo: 'nav-tools:camera-video',
  cameraParameters: 'nav-tools:camera-parameters',
  motor: 'motor-config',
  statusOrder: 'nav-tools:status-order',
} as const

const TEXT_SETTING_KEYS = {
  theme: 'nav-tools:theme',
  locale: 'nav-tools:locale',
} as const

export interface ConfigurationExportOptions {
  applications: readonly UserApplication[]
  selectedApplicationId?: string
  exportedAt?: Date
}

export interface NavToolsConfigurationExport {
  format: 'nav-tools-configuration'
  version: 1
  exportedAt: string
  selectedApplicationId?: string
  applications: UserApplication[]
  layouts: Record<string, unknown>
  settings: {
    dataSource?: unknown
    cameraVideo?: unknown
    cameraParameters?: unknown
    motor?: unknown
    statusOrder?: unknown
    theme?: string
    locale?: string
  }
}

function readJson(storage: StorageLike, key: string): unknown | undefined {
  const raw = storage.getItem(key)
  if (raw === null) return undefined

  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

export function buildConfigurationExport(
  storage: StorageLike,
  options: ConfigurationExportOptions,
): NavToolsConfigurationExport {
  const layouts: Record<string, unknown> = {}
  for (const application of options.applications) {
    const layout = readJson(storage, `${LAYOUT_STORAGE_PREFIX}:${application.id}`)
    if (layout !== undefined) layouts[application.id] = layout
  }

  const settings: NavToolsConfigurationExport['settings'] = {}
  for (const [name, key] of Object.entries(JSON_SETTING_KEYS)) {
    const value = readJson(storage, key)
    if (value !== undefined) settings[name as keyof typeof JSON_SETTING_KEYS] = value
  }
  for (const [name, key] of Object.entries(TEXT_SETTING_KEYS)) {
    const value = storage.getItem(key)
    if (value !== null) settings[name as keyof typeof TEXT_SETTING_KEYS] = value
  }

  return {
    format: 'nav-tools-configuration',
    version: 1,
    exportedAt: (options.exportedAt ?? new Date()).toISOString(),
    ...(options.selectedApplicationId
      ? { selectedApplicationId: options.selectedApplicationId }
      : {}),
    applications: options.applications.map((application) => ({
      ...application,
      windowIds: [...application.windowIds],
    })),
    layouts,
    settings,
  }
}

export function createConfigurationExportFilename(date = new Date()): string {
  const timestamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-')
  return `nav-tools-configuration-${timestamp}.json`
}

export function downloadConfigurationExport(
  configuration: NavToolsConfigurationExport,
  exportedAt = new Date(configuration.exportedAt),
): void {
  const blob = new Blob([JSON.stringify(configuration, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  try {
    link.href = url
    link.download = createConfigurationExportFilename(exportedAt)
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}
