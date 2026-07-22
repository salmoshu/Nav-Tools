import { normalizePanelIds, panelRegistry, type UserApplication } from '../panels/registry'
import { JsonStorage } from '../storage/JsonStorage'

const APPLICATIONS_KEY = 'nav-tools:custom-applications'
const SELECTED_APPLICATION_KEY = 'nav-tools:selected-application'

export const DEFAULT_APPLICATIONS: readonly UserApplication[] = [
  {
    id: 'gnss',
    name: 'GNSS',
    description: 'GNSS positioning, satellite, and raw message workspace',
    icon: 'position',
    accent: '#0ea5e9',
    windowIds: ['raw-messages', 'gnss-deviation', 'gnss-signals', 'sky-plot'],
  },
  {
    id: 'motor',
    name: 'Motor',
    description: 'Motor telemetry, command, and parameter workspace',
    icon: 'motor',
    accent: '#f97316',
    windowIds: ['plot', 'raw-messages', 'motor-parameters'],
  },
]

export class ApplicationStorage {
  public constructor(private readonly storage: JsonStorage) {}

  public loadApplications(): UserApplication[] {
    if (this.storage.readRaw(APPLICATIONS_KEY) === null) {
      const defaults = cloneApplications(DEFAULT_APPLICATIONS)
      this.saveApplications(defaults)
      return defaults
    }

    const stored = this.storage.read<unknown[]>(APPLICATIONS_KEY, [], Array.isArray)
    const applications = stored.filter(isUserApplication).map((application) => ({
      ...application,
      windowIds: sanitizePanelIds(application.windowIds),
    }))
    this.saveApplications(applications)
    return applications
  }

  public saveApplications(applications: UserApplication[]): void {
    this.storage.write(APPLICATIONS_KEY, applications)
  }

  public resetApplicationsToDefaults(): UserApplication[] {
    const defaults = cloneApplications(DEFAULT_APPLICATIONS)
    this.saveApplications(defaults)
    return defaults
  }

  public loadSelectedApplicationId(): string | undefined {
    const raw = this.storage.readRaw(SELECTED_APPLICATION_KEY)
    if (!raw) return undefined
    try {
      const selected: unknown = JSON.parse(raw)
      return typeof selected === 'string' ? selected : undefined
    } catch {
      return raw
    }
  }

  public saveSelectedApplicationId(applicationId: string | undefined): void {
    if (applicationId) this.storage.writeRaw(SELECTED_APPLICATION_KEY, applicationId)
    else this.storage.remove(SELECTED_APPLICATION_KEY)
  }
}

export function sanitizePanelIds(ids: readonly string[]): string[] {
  const requested = new Set(normalizePanelIds(ids))
  return panelRegistry.filter((panel) => requested.has(panel.id)).map((panel) => panel.id)
}

function cloneApplications(applications: readonly UserApplication[]): UserApplication[] {
  return applications.map((application) => ({
    ...application,
    windowIds: sanitizePanelIds(application.windowIds),
  }))
}

function isUserApplication(value: unknown): value is UserApplication {
  if (!value || typeof value !== 'object') return false
  const application = value as UserApplication
  return (
    typeof application.id === 'string' &&
    typeof application.name === 'string' &&
    typeof application.description === 'string' &&
    typeof application.icon === 'string' &&
    typeof application.accent === 'string' &&
    Array.isArray(application.windowIds) &&
    application.windowIds.every((id) => typeof id === 'string')
  )
}
