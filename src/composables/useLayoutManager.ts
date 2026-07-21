import { computed, defineAsyncComponent, markRaw, ref, watch } from 'vue'
import type { DefineComponent } from 'vue'
import { ElMessage } from 'element-plus'
import { getWindowById, getWindowsByIds, navMode, normalizeWindowId, type WindowDefinition } from '@/settings/config'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { showStatusBar } from '@/composables/useStatusManager'
import { LayoutStorage, type PersistedLayoutItem } from '@/core/layout/LayoutStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'
import emitter from '@/hooks/useMitt'

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
  '../components/panels/*.vue',
  '../components/flow/*.vue',
  '../components/gnss/*.vue',
  '../components/motor/*.vue',
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

  let showStatusBarInitialized = false
  watch(showStatusBar, () => {
    if (!showStatusBarInitialized) {
      showStatusBarInitialized = true
      return
    }
    emitter.emit('layout-changed')
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
      .filter(windowDefinition => !restoredWindowIds.has(windowDefinition.id))
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
    await createDefaultLayout()
  }

  function saveLayout() {
    saveCurrentLayout()
    ElMessage({
      message: '布局已保存',
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
        message: '该窗口不属于当前应用',
        type: 'warning',
        duration: 1000,
        placement: 'bottom-right',
        offset: 50,
      })
      return
    }

    layoutDraggableList.value.unshift({
      ...createLayoutItem(windowDefinition, layoutDraggableList.value.length),
      i: `${windowDefinition.id}-${Date.now()}`,
      x: 0,
      y: 0,
    })
  }

  function removeItem(id: string) {
    const index = layoutDraggableList.value.findIndex(item => item.i === id)
    if (index !== -1) layoutDraggableList.value.splice(index, 1)
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
