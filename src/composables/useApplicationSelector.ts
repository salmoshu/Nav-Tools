import { computed, ref } from 'vue'
import {
  getWindowsByIds,
  navMode,
  windowCatalog,
  type UserApplication,
} from '@/settings/config'
import { ApplicationStorage, sanitizePanelIds } from '@/core/application/ApplicationStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'

const applicationStorage = new ApplicationStorage(new JsonStorage(localStorage))
const applications = ref<UserApplication[]>(applicationStorage.loadApplications())
const savedApplicationId = applicationStorage.loadSelectedApplicationId()
const savedApplication = applications.value.find(application => application.id === savedApplicationId)
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
  const firstWindow = windows.find(windowDefinition => windowDefinition.funcMode !== 'general') ?? windows[0]
  navMode.appMode = firstWindow?.appMode ?? 'custom'
  navMode.funcMode = firstWindow?.funcMode ?? 'none'
}

export function useApplicationSelector() {
  const currentApplication = computed(() =>
    applications.value.find(application => application.id === currentApplicationId.value),
  )
  const currentWindows = computed(() =>
    getWindowsByIds(currentApplication.value?.windowIds ?? []),
  )
  const activeDataModes = computed(() =>
    [...new Set(currentWindows.value.map(windowDefinition => windowDefinition.funcMode))],
  )

  const selectApplication = (applicationId: string, persist = true) => {
    const application = applications.value.find(candidate => candidate.id === applicationId)
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
    const index = applications.value.findIndex(candidate => candidate.id === saved.id)

    if (index === -1) {
      applications.value.push(saved)
    } else {
      applications.value[index] = saved
    }

    persistApplications()
    return saved
  }

  const deleteApplication = (applicationId: string) => {
    applications.value = applications.value.filter(application => application.id !== applicationId)
    persistApplications()

    if (currentApplicationId.value === applicationId) {
      currentApplicationId.value = undefined
      applicationStorage.saveSelectedApplicationId(undefined)
      isApplicationSelectorOpen.value = true
    }
  }

  const openApplicationSelector = () => {
    isApplicationSelectorOpen.value = true
  }

  const closeApplicationSelector = () => {
    if (currentApplication.value) {
      isApplicationSelectorOpen.value = false
    }
  }

  return {
    applications,
    windowCatalog,
    currentApplication,
    currentApplicationId,
    currentWindows,
    activeDataModes,
    isApplicationSelectorOpen,
    selectApplication,
    saveApplication,
    deleteApplication,
    openApplicationSelector,
    closeApplicationSelector,
  }
}
