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
  /** 用户主动移除的窗口 ID，恢复布局时不再自动补回 */
  removedWindowIds?: string[]
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

  public save(
    applicationId: string,
    items: PersistedLayoutItem[],
    showStatusBar: boolean,
    removedWindowIds: string[] = [],
  ): void {
    this.storage.write<LayoutDocument>(this.key(applicationId), {
      version: 1,
      items,
      showStatusBar,
      removedWindowIds,
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
    typeof document.showStatusBar === 'boolean' &&
    (document.removedWindowIds === undefined ||
      (Array.isArray(document.removedWindowIds) &&
        document.removedWindowIds.every(id => typeof id === 'string')))
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
