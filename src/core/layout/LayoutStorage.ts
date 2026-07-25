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
  /** 工具栏可见性；旧版文档缺省视为 true */
  showToolBar?: boolean
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
    showToolBar?: boolean,
  ): void {
    this.storage.write<LayoutDocument>(this.key(applicationId), {
      version: 1,
      items,
      showStatusBar,
      ...(showToolBar === undefined ? {} : { showToolBar }),
      removedWindowIds,
    })
  }

  public remove(applicationId: string): void {
    this.storage.remove(this.key(applicationId))
    this.storage.remove(`dashboard-layout-app-${applicationId}`)
    this.storage.remove(`statusbar-layout-app-${applicationId}`)
  }

  /**
   * 静默更新工具栏/状态栏可见性，不触碰布局项。
   * 用于用户切换 toolbar/statusbar 时立即持久化，而不触发"布局已变更"保存提示。
   */
  public updateVisibility(
    applicationId: string,
    showStatusBar: boolean,
    showToolBar: boolean,
  ): void {
    const existing = this.load(applicationId)
    if (!existing) {
      // 尚无布局文档时仅写入可见性标记（items 为空，后续首次保存布局时补全）
      this.storage.write<LayoutDocument>(this.key(applicationId), {
        version: 1,
        items: [],
        showStatusBar,
        showToolBar,
        removedWindowIds: [],
      })
      return
    }
    this.storage.write<LayoutDocument>(this.key(applicationId), {
      ...existing,
      showStatusBar,
      showToolBar,
    })
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
    (document.showToolBar === undefined || typeof document.showToolBar === 'boolean') &&
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
