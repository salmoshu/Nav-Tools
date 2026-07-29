import { normalizePanelIds, panelRegistry, type UserApplication } from '../panels/registry'
import { JsonStorage } from '../storage/JsonStorage'

const APPLICATIONS_KEY = 'nav-tools:custom-applications'
const SELECTED_APPLICATION_KEY = 'nav-tools:selected-application'
const CAMERA_DEFAULT_MIGRATION_KEY = 'nav-tools:migration:camera-default-v1'
const CAMERA_PARAMETERS_MIGRATION_KEY = 'nav-tools:migration:camera-parameters-v1'
const SERIAL_DEFAULT_MIGRATION_KEY = 'nav-tools:migration:serial-default-v1'
const GNSS_MESSAGES_MIGRATION_KEY = 'nav-tools:migration:gnss-messages-v1'
const FLOW_DEFAULT_MIGRATION_KEY = 'nav-tools:migration:flow-default-v1'

export const DEFAULT_APPLICATIONS: readonly UserApplication[] = [
  {
    id: 'serial',
    name: 'Serial',
    description: 'Serial port telemetry and raw message workspace',
    icon: 'connection',
    accent: '#8b5cf6',
    windowIds: ['plot', 'raw-messages', 'motor-parameters'],
  },
  {
    id: 'gnss',
    name: 'GNSS',
    description: 'GNSS positioning, satellite, and raw message workspace',
    icon: 'position',
    accent: '#0ea5e9',
    windowIds: ['gnss-map', 'gnss-deviation', 'gnss-signals', 'sky-plot', 'raw-messages'],
  },
  {
    id: 'motor',
    name: 'Flow',
    description: 'Flow deviation, telemetry, and parameter workspace',
    icon: 'motor',
    accent: '#f97316',
    windowIds: ['plot', 'raw-messages', 'flow-deviation', 'motor-parameters'],
  },
  {
    id: 'camera',
    name: 'Camera',
    description: 'Camera live video and parameter control workspace',
    icon: 'camera',
    accent: '#14b8a6',
    windowIds: ['camera-video', 'camera-parameters'],
  },
]

export class ApplicationStorage {
  public constructor(private readonly storage: JsonStorage) {}

  public loadApplications(): UserApplication[] {
    if (this.storage.readRaw(APPLICATIONS_KEY) === null) {
      const defaults = cloneApplications(DEFAULT_APPLICATIONS)
      this.saveApplications(defaults)
      this.storage.writeRaw(CAMERA_DEFAULT_MIGRATION_KEY, '1')
      this.storage.writeRaw(CAMERA_PARAMETERS_MIGRATION_KEY, '1')
      this.storage.writeRaw(SERIAL_DEFAULT_MIGRATION_KEY, '1')
      this.storage.writeRaw(FLOW_DEFAULT_MIGRATION_KEY, '1')
      return defaults
    }

    const stored = this.storage.read<unknown[]>(APPLICATIONS_KEY, [], Array.isArray)
    const applications = stored.filter(isUserApplication).map((application) => ({
      ...application,
      windowIds: sanitizePanelIds(application.windowIds),
    }))
    if (this.storage.readRaw(CAMERA_DEFAULT_MIGRATION_KEY) === null) {
      const cameraDefault = DEFAULT_APPLICATIONS.find((application) => application.id === 'camera')
      if (
        applications.length > 0 &&
        cameraDefault &&
        !applications.some(({ id }) => id === 'camera')
      ) {
        applications.push(cloneApplications([cameraDefault])[0])
      }
      this.storage.writeRaw(CAMERA_DEFAULT_MIGRATION_KEY, '1')
    }
    if (this.storage.readRaw(CAMERA_PARAMETERS_MIGRATION_KEY) === null) {
      const cameraApplication = applications.find((application) => application.id === 'camera')
      if (cameraApplication && !cameraApplication.windowIds.includes('camera-parameters')) {
        cameraApplication.windowIds.push('camera-parameters')
      }
      this.storage.writeRaw(CAMERA_PARAMETERS_MIGRATION_KEY, '1')
    }
    if (this.storage.readRaw(SERIAL_DEFAULT_MIGRATION_KEY) === null) {
      const serialDefault = DEFAULT_APPLICATIONS.find((application) => application.id === 'serial')
      if (
        applications.length > 0 &&
        serialDefault &&
        !applications.some(({ id }) => id === 'serial')
      ) {
        applications.push(cloneApplications([serialDefault])[0])
      }
      this.storage.writeRaw(SERIAL_DEFAULT_MIGRATION_KEY, '1')
    }
    if (this.storage.readRaw(GNSS_MESSAGES_MIGRATION_KEY) === null) {
      const gnssApplication = applications.find((application) => application.id === 'gnss')
      if (gnssApplication && gnssApplication.windowIds[0] === 'raw-messages') {
        gnssApplication.windowIds = [
          ...gnssApplication.windowIds.filter((id) => id !== 'raw-messages'),
          'raw-messages',
        ]
      }
      this.storage.writeRaw(GNSS_MESSAGES_MIGRATION_KEY, '1')
    }
    if (this.storage.readRaw(FLOW_DEFAULT_MIGRATION_KEY) === null) {
      const flowDefault = DEFAULT_APPLICATIONS.find((application) => application.id === 'motor')
      const motorApplication = applications.find((application) => application.id === 'motor')
      if (motorApplication && flowDefault) {
        if (motorApplication.name === 'Motor') {
          motorApplication.name = flowDefault.name
          motorApplication.description = flowDefault.description
        }
        if (!motorApplication.windowIds.includes('flow-deviation')) {
          motorApplication.windowIds.push('flow-deviation')
        }
      }
      const serialApplication = applications.find((application) => application.id === 'serial')
      if (serialApplication && !serialApplication.windowIds.includes('motor-parameters')) {
        serialApplication.windowIds.push('motor-parameters')
      }
      this.storage.writeRaw(FLOW_DEFAULT_MIGRATION_KEY, '1')
    }
    this.saveApplications(applications)
    return applications
  }

  public saveApplications(applications: UserApplication[]): void {
    this.storage.write(APPLICATIONS_KEY, applications)
  }

  public resetApplicationsToDefaults(): UserApplication[] {
    const defaults = cloneApplications(DEFAULT_APPLICATIONS)
    this.saveApplications(defaults)
    this.storage.writeRaw(CAMERA_DEFAULT_MIGRATION_KEY, '1')
    this.storage.writeRaw(CAMERA_PARAMETERS_MIGRATION_KEY, '1')
    this.storage.writeRaw(SERIAL_DEFAULT_MIGRATION_KEY, '1')
    this.storage.writeRaw(GNSS_MESSAGES_MIGRATION_KEY, '1')
    this.storage.writeRaw(FLOW_DEFAULT_MIGRATION_KEY, '1')
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
  const validIds = new Set(panelRegistry.map((panel) => panel.id))
  return normalizePanelIds(ids).filter((id) => validIds.has(id))
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
