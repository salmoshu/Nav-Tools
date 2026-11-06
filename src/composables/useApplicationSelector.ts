import { computed, ref } from 'vue'
import { getWindowsByIds, navMode, windowCatalog, type UserApplication } from '@/settings/config'
import {
  ApplicationStorage,
  DEFAULT_APPLICATIONS,
  sanitizePanelIds,
} from '@/core/application/ApplicationStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'

const applicationStorage = new ApplicationStorage(new JsonStorage(localStorage))
const applications = ref<UserApplication[]>(applicationStorage.loadApplications())
const enabledDefaultApplicationIds = ref(applicationStorage.loadEnabledDefaultApplicationIds())
const defaultApplicationIds = new Set(DEFAULT_APPLICATIONS.map((application) => application.id))
const visibleApplications = computed({
  get: () =>
    applications.value.filter(
      (application) =>
        !defaultApplicationIds.has(application.id) ||
        enabledDefaultApplicationIds.value.includes(application.id),
    ),
  set: (ordered: UserApplication[]) => {
    const visibleIds = new Set(visibleApplications.value.map((application) => application.id))
    let index = 0
    // 拖动可见卡片时保留隐藏应用及其配置，只替换可见应用所在的位置。
    applications.value = applications.value.map((application) =>
      visibleIds.has(application.id) ? ordered[index++] : application,
    )
  },
})
const savedApplicationId = applicationStorage.loadSelectedApplicationId()
const savedApplication = applications.value.find(
  (application) => application.id === savedApplicationId,
)
const currentApplicationId = ref<string | undefined>(savedApplication?.id)
const isApplicationSelectorOpen = ref(true)

function persistApplications() {
  applicationStorage.saveApplications(applications.value)
}

function createApplicationId() {
  return globalThis.crypto?.randomUUID?.() ?? `application-${Date.now()}`
}

function applyDataMode(application: UserApplication) {
  const windows = getWindowsByIds(application.windowIds)
  const firstWindow =
    windows.find((windowDefinition) => windowDefinition.funcMode !== 'general') ?? windows[0]
  navMode.appMode = firstWindow?.appMode ?? 'custom'
  navMode.funcMode = firstWindow?.funcMode ?? 'none'
}

export function useApplicationSelector() {
  const currentApplication = computed(() =>
    applications.value.find((application) => application.id === currentApplicationId.value),
  )
  const currentWindows = computed(() => getWindowsByIds(currentApplication.value?.windowIds ?? []))
  const activeDataModes = computed(() => [
    ...new Set(currentWindows.value.map((windowDefinition) => windowDefinition.funcMode)),
  ])
  /** 当前应用包含面板的 moduleId 集合；status source 等按模块命中的场景用这个，不要按 funcMode */
  const activeModuleIds = computed(
    () => new Set(currentWindows.value.map((windowDefinition) => windowDefinition.moduleId)),
  )

  const selectApplication = (applicationId: string, persist = true) => {
    const application = applications.value.find((candidate) => candidate.id === applicationId)
    if (!application) return undefined

    currentApplicationId.value = application.id
    applyDataMode(application)
    isApplicationSelectorOpen.value = false

    if (persist) {
      applicationStorage.saveSelectedApplicationId(application.id)
    }

    return application
  }

  const saveApplication = (application: Omit<UserApplication, 'id'> & { id?: string }) => {
    const sanitizedWindowIds = sanitizePanelIds(application.windowIds)
    const saved: UserApplication = {
      ...application,
      id: application.id ?? createApplicationId(),
      name: application.name.trim(),
      description: application.description.trim(),
      windowIds: sanitizedWindowIds,
    }
    const index = applications.value.findIndex((candidate) => candidate.id === saved.id)

    if (index === -1) {
      applications.value.push(saved)
    } else {
      applications.value[index] = saved
    }

    persistApplications()
    return saved
  }

  const isDefaultApplicationEnabled = (applicationId: string) =>
    enabledDefaultApplicationIds.value.includes(applicationId) &&
    applications.value.some((application) => application.id === applicationId)

  const setDefaultApplicationEnabled = (applicationId: string, enabled: boolean) => {
    const defaultIndex = DEFAULT_APPLICATIONS.findIndex(
      (application) => application.id === applicationId,
    )
    if (defaultIndex === -1) return

    if (enabled && !applications.value.some((application) => application.id === applicationId)) {
      const defaultApplication = DEFAULT_APPLICATIONS[defaultIndex]
      const followingIds = new Set(DEFAULT_APPLICATIONS.slice(defaultIndex + 1).map(({ id }) => id))
      const nextIndex = applications.value.findIndex((application) =>
        followingIds.has(application.id),
      )
      applications.value.splice(nextIndex === -1 ? applications.value.length : nextIndex, 0, {
        ...defaultApplication,
        windowIds: sanitizePanelIds(defaultApplication.windowIds),
      })
      persistApplications()
    }

    const ids = enabledDefaultApplicationIds.value.filter((id) => id !== applicationId)
    if (enabled) ids.push(applicationId)
    enabledDefaultApplicationIds.value = applicationStorage.saveEnabledDefaultApplicationIds(ids)
  }

  const deleteApplication = (applicationId: string) => {
    setDefaultApplicationEnabled(applicationId, false)
    applications.value = applications.value.filter(
      (application) => application.id !== applicationId,
    )
    persistApplications()

    if (currentApplicationId.value === applicationId) {
      currentApplicationId.value = undefined
      applicationStorage.saveSelectedApplicationId(undefined)
      isApplicationSelectorOpen.value = true
    }
  }

  const reorderApplications = (fromIndex: number, toIndex: number) => {
    const ordered = [...visibleApplications.value]
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= ordered.length) return ordered
    const [application] = ordered.splice(fromIndex, 1)
    ordered.splice(Math.max(0, Math.min(toIndex, ordered.length)), 0, application)
    visibleApplications.value = ordered
    persistApplications()
    return ordered
  }

  const saveApplicationOrder = () => {
    applicationStorage.saveApplications(applications.value)
  }

  const resetApplications = () => {
    applications.value = applicationStorage.resetApplicationsToDefaults()
    const currentApplication = applications.value.find(
      (application) => application.id === currentApplicationId.value,
    )

    if (currentApplication) {
      applyDataMode(currentApplication)
      applicationStorage.saveSelectedApplicationId(currentApplication.id)
    } else {
      currentApplicationId.value = undefined
      applicationStorage.saveSelectedApplicationId(undefined)
      isApplicationSelectorOpen.value = true
    }

    return applications.value
  }

  const openApplicationSelector = () => {
    isApplicationSelectorOpen.value = true
  }

  const closeApplicationSelector = () => {
    isApplicationSelectorOpen.value = false
  }

  return {
    applications,
    visibleApplications,
    isDefaultApplicationEnabled,
    setDefaultApplicationEnabled,
    windowCatalog,
    currentApplication,
    currentApplicationId,
    currentWindows,
    activeDataModes,
    activeModuleIds,
    isApplicationSelectorOpen,
    selectApplication,
    saveApplication,
    deleteApplication,
    reorderApplications,
    saveApplicationOrder,
    resetApplications,
    openApplicationSelector,
    closeApplicationSelector,
  }
}
