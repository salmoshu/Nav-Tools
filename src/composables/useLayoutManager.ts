import { computed, defineAsyncComponent, markRaw, ref, watch } from 'vue'
import type { DefineComponent } from 'vue'
import { ElMessage } from 'element-plus'
import { getWindowById, getWindowsByIds, navMode, normalizeWindowId, type WindowDefinition } from '@/settings/config'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { showStatusBar, showToolBar, toolbarPosition, statusbarPosition } from '@/composables/useStatusManager'
import { LayoutStorage, type PersistedLayoutItem } from '@/core/layout/LayoutStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'
import emitter from '@/hooks/useMitt'
import { t } from '@/i18n'

export interface LayoutItem {
  titleName: string
  component: any
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

const componentCache = new Map<string, any>()
const layoutStorage = new LayoutStorage(new JsonStorage(localStorage))
const modules = import.meta.glob<DefineComponent>([
  '../components/windows/common/*.vue',
  '../components/windows/gnss/*.vue',
  '../components/windows/motor/*.vue',
])

function loadComponent(componentPath: string) {
  const resolvedPath = componentPath.replace('@/', '../')
  if (componentCache.has(resolvedPath)) return componentCache.get(resolvedPath)

  const loader = modules[resolvedPath]
  if (!loader) {
    console.error(`[loadComponent] 未找到组件: ${resolvedPath}`)
    return null
  }

  const component = markRaw(defineAsyncComponent(loader))
  componentCache.set(resolvedPath, component)
  return component
}

function createLayoutItem(windowDefinition: WindowDefinition, index: number): LayoutItem {
  return {
    x: (index % 2) * 6,
    y: Math.floor(index / 2) * 6,
    w: 6,
    h: 6,
    i: `${windowDefinition.id}-${index + 1}`,
    windowId: windowDefinition.id,
    titleName: windowDefinition.title,
    componentName: windowDefinition.componentName,
    component: markRaw(loadComponent(windowDefinition.componentPath)),
    minW: 4,
    minH: 5,
    maxW: 12,
    maxH: 12,
  }
}

export function useLayoutManager() {
  const { applications, currentApplicationId } = useApplicationSelector()
  const layoutApplicationId = ref<string | undefined>()
  const layoutDraggableList = ref<LayoutItem[]>([])
  const originalLayout = ref<LayoutItem[]>([])
  // 用户主动移除的窗口，恢复布局时不再作为“缺失窗口”自动补回
  const removedWindowIds = new Set<string>()
  // initLayout 完成从持久化恢复后变为 true，之后停靠位置变化才会静默持久化
  let layoutPersistenceReady = false

  const currentApplication = computed(() =>
    applications.value.find(application => application.id === layoutApplicationId.value),
  )
  const allowedWindows = computed(() =>
    getWindowsByIds(currentApplication.value?.windowIds ?? []),
  )

  const hasLayoutChanged = computed(() => {
    if (layoutDraggableList.value.length !== originalLayout.value.length) return true

    return layoutDraggableList.value.some((item, index) => {
      const original = originalLayout.value[index]
      return !original
        || item.x !== original.x
        || item.y !== original.y
        || item.w !== original.w
        || item.h !== original.h
        || item.windowId !== original.windowId
    })
  })

  watch(hasLayoutChanged, changed => {
    if (changed) emitter.emit('layout-changed')
  })

  // toolbar/statusbar 可见性切换：静默持久化，不触发"布局已变更"保存提示。
  // 重新进入应用时由 initLayout 读取持久化状态自动恢复。
  function persistVisibilitySilently() {
    const appId = layoutApplicationId.value
    if (!appId) return
    layoutStorage.updateVisibility(
      appId,
      showStatusBar.value !== false,
      showToolBar.value !== false,
      toolbarPosition.value,
      statusbarPosition.value,
    )
  }

  let showStatusBarInitialized = false
  watch(showStatusBar, () => {
    if (!showStatusBarInitialized) {
      showStatusBarInitialized = true
      return
    }
    persistVisibilitySilently()
  })

  let showToolBarInitialized = false
  watch(showToolBar, () => {
    if (!showToolBarInitialized) {
      showToolBarInitialized = true
      return
    }
    persistVisibilitySilently()
  })

  // 工具栏/状态栏停靠位置变化：静默持久化，不触发"布局已变更"保存提示；
  // 仅在 initLayout 完成恢复后再持久化，避免把恢复过程本身误存为一次用户变更。
  watch(toolbarPosition, () => {
    if (!layoutPersistenceReady) return
    persistVisibilitySilently()
  })

  // 状态栏停靠位置变化：同上，静默持久化。
  watch(statusbarPosition, () => {
    if (!layoutPersistenceReady) return
    persistVisibilitySilently()
  })

  function backupCurrentLayout() {
    originalLayout.value = layoutDraggableList.value.map(item => ({ ...item }))
  }

  function saveCurrentLayout() {
    if (!layoutApplicationId.value) return

    const layoutToSave = layoutDraggableList.value.map(({ component: _component, ...item }) => item)
    layoutStorage.save(
      layoutApplicationId.value,
      layoutToSave as PersistedLayoutItem[],
      showStatusBar.value !== false,
      [...removedWindowIds],
      showToolBar.value !== false,
      toolbarPosition.value,
      statusbarPosition.value,
    )
  }

  async function loadLayoutFromConfig(config: any[]) {
    const allowedById = new Map(allowedWindows.value.map(item => [item.id, item]))
    const allowedByComponent = new Map(allowedWindows.value.map(item => [item.componentName, item]))
    const restoredWindowIds = new Set<string>()

    const restored = config.flatMap((item: any) => {
      const windowDefinition = allowedById.get(normalizeWindowId(item.windowId ?? ''))
        ?? allowedByComponent.get(item.componentName)
      if (!windowDefinition || restoredWindowIds.has(windowDefinition.id)) return []

      restoredWindowIds.add(windowDefinition.id)

      return [{
        ...item,
        windowId: windowDefinition.id,
        titleName: windowDefinition.title,
        componentName: windowDefinition.componentName,
        component: markRaw(loadComponent(windowDefinition.componentPath)),
      }]
    })

    const missing = allowedWindows.value
      .filter(windowDefinition =>
        !restoredWindowIds.has(windowDefinition.id) && !removedWindowIds.has(windowDefinition.id))
      .map((windowDefinition, index) => createLayoutItem(windowDefinition, restored.length + index))

    layoutDraggableList.value = [...restored, ...missing]
    backupCurrentLayout()
  }

  async function createDefaultLayout() {
    layoutDraggableList.value = allowedWindows.value.map(createLayoutItem)
    backupCurrentLayout()
  }

  async function initLayout(applicationId = currentApplicationId.value) {
    layoutApplicationId.value = applicationId
    removedWindowIds.clear()
    if (!applicationId || !currentApplication.value) {
      layoutDraggableList.value = []
      backupCurrentLayout()
      return
    }

    const firstWindow = allowedWindows.value[0]
    navMode.appMode = firstWindow?.appMode ?? 'custom'
    navMode.funcMode = firstWindow?.funcMode ?? 'none'

    const savedLayout = layoutStorage.load(applicationId)
    showStatusBar.value = savedLayout?.showStatusBar ?? true
    showToolBar.value = savedLayout?.showToolBar ?? true
    toolbarPosition.value = savedLayout?.toolbarPosition ?? 'bottom'
    statusbarPosition.value = savedLayout?.statusbarPosition ?? 'right'
    savedLayout?.removedWindowIds?.forEach(id => removedWindowIds.add(id))

    // 恢复完成，此后停靠位置变化才静默持久化
    layoutPersistenceReady = true

    if (!savedLayout) {
      await createDefaultLayout()
      return
    }

    try {
      await loadLayoutFromConfig(savedLayout.items)
    } catch (error) {
      console.error('Failed to load saved layout:', error)
      await createDefaultLayout()
    }
  }

  async function createBestLayout() {
    const componentCount = layoutDraggableList.value.length
    const columnCount = componentCount > 9 ? 4 : componentCount > 4 ? 3 : 2
    const cellWidth = 12 / columnCount

    layoutDraggableList.value = layoutDraggableList.value.map((item, index) => ({
      ...item,
      x: (index % columnCount) * cellWidth,
      y: Math.floor(index / columnCount) * 6,
      w: cellWidth,
      h: 6,
    }))
    backupCurrentLayout()
  }

  async function autoLayout() {
    if (layoutApplicationId.value) layoutStorage.remove(layoutApplicationId.value)
    await createBestLayout()
  }

  async function resetLayout() {
    if (layoutApplicationId.value) layoutStorage.remove(layoutApplicationId.value)
    removedWindowIds.clear()
    // 重置布局时一并复位工具栏/状态栏停靠位置（自适应 Auto 不应触碰工具栏/状态栏）
    toolbarPosition.value = 'bottom'
    statusbarPosition.value = 'right'
    await createDefaultLayout()
  }

  function saveLayout() {
    saveCurrentLayout()
    ElMessage({
      message: t('data.layoutSaved'),
      type: 'success',
      duration: 1000,
      placement: 'bottom-right',
      offset: 50,
    })
    backupCurrentLayout()
  }

  function editLayout() {
    // 网格始终处于可编辑状态。
  }

  async function addItem(windowId: string) {
    const windowDefinition = getWindowById(windowId)
    if (!windowDefinition || !currentApplication.value?.windowIds.includes(windowId)) {
      ElMessage({
        message: t('data.windowNotInApp'),
        type: 'warning',
        duration: 1000,
        placement: 'bottom-right',
        offset: 50,
      })
      return
    }

    removedWindowIds.delete(windowDefinition.id)
    layoutDraggableList.value.unshift({
      ...createLayoutItem(windowDefinition, layoutDraggableList.value.length),
      i: `${windowDefinition.id}-${Date.now()}`,
      x: 0,
      y: 0,
    })
  }

  function removeItem(id: string) {
    const index = layoutDraggableList.value.findIndex(item => item.i === id)
    if (index === -1) return

    removedWindowIds.add(layoutDraggableList.value[index].windowId)
    layoutDraggableList.value.splice(index, 1)
  }

  async function handleApplicationChange(applicationId: string, forceReload = false) {
    if (layoutApplicationId.value === applicationId && !forceReload) return

    saveCurrentLayout()
    await initLayout(applicationId)
  }

  return {
    layoutDraggableList,
    hasLayoutChanged,
    initLayout,
    saveCurrentLayout,
    autoLayout,
    resetLayout,
    saveLayout,
    editLayout,
    addItem,
    removeItem,
    handleApplicationChange,
    loadLayoutFromConfig,
  }
}
