import { JsonStorage } from '../storage/JsonStorage'

export interface PersistedLayoutItem {
  titleName: string
  componentName: string
  windowId: string
  x: number
  y: number
  w: number
  h: number
  i: string
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

interface LayoutDocument {
  version: 1
  items: PersistedLayoutItem[]
  showStatusBar: boolean
}

const STORAGE_PREFIX = 'nav-tools:layout'

export class LayoutStorage {
  public constructor(private readonly storage: JsonStorage) {}

  public load(applicationId: string): LayoutDocument | undefined {
    const current = this.storage.read<LayoutDocument | undefined>(
      this.key(applicationId),
      undefined,
      isLayoutDocument,
    )
    if (current) return current

    const legacyItems = this.storage.read<unknown[]>(
      `dashboard-layout-app-${applicationId}`,
      [],
      Array.isArray,
    )
    if (legacyItems.length === 0) return undefined

    const legacyStatus = this.storage.read(`statusbar-layout-app-${applicationId}`, true)
    const migrated: LayoutDocument = {
      version: 1,
      items: legacyItems.filter(isPersistedLayoutItem),
      showStatusBar: typeof legacyStatus === 'boolean' ? legacyStatus : true,
    }
    this.save(applicationId, migrated.items, migrated.showStatusBar)
    return migrated
  }

  public save(applicationId: string, items: PersistedLayoutItem[], showStatusBar: boolean): void {
    this.storage.write<LayoutDocument>(this.key(applicationId), {
      version: 1,
      items,
      showStatusBar,
    })
  }

  public remove(applicationId: string): void {
    this.storage.remove(this.key(applicationId))
    this.storage.remove(`dashboard-layout-app-${applicationId}`)
    this.storage.remove(`statusbar-layout-app-${applicationId}`)
  }

  private key(applicationId: string): string {
    return `${STORAGE_PREFIX}:${applicationId}`
  }
}

function isLayoutDocument(value: unknown): value is LayoutDocument {
  if (!value || typeof value !== 'object') return false
  const document = value as LayoutDocument
  return (
    document.version === 1 &&
    Array.isArray(document.items) &&
    document.items.every(isPersistedLayoutItem) &&
    typeof document.showStatusBar === 'boolean'
  )
}

function isPersistedLayoutItem(value: unknown): value is PersistedLayoutItem {
  if (!value || typeof value !== 'object') return false
  const item = value as PersistedLayoutItem
  return (
    typeof item.windowId === 'string' &&
    typeof item.componentName === 'string' &&
    typeof item.i === 'string' &&
    [item.x, item.y, item.w, item.h].every(Number.isFinite)
  )
}
