<template>
  <div
    v-if="open"
    class="selector-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="application-selector-title"
    @click.self="$emit('close')"
  >
    <section class="selector-panel">
      <header class="selector-header">
        <div>
          <h1 id="application-selector-title">{{ t('app.selector.title') }}</h1>
          <p>{{ t('app.selector.subtitle') }}</p>
        </div>
        <div class="header-actions">
          <el-button v-if="applications.length > 0" :icon="Plus" @click="openEditor()">
            {{ t('app.selector.newApp') }}
          </el-button>
          <el-button v-if="applications.length > 0" :icon="Refresh" @click="confirmReset">
            {{ t('app.selector.resetApp') }}
          </el-button>
          <el-button
            v-if="currentApplicationId"
            text
            circle
            :title="t('app.selector.close')"
            :aria-label="t('app.selector.close')"
            @click="$emit('close')"
          >
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </header>

      <div v-if="applications.length === 0" class="empty-state">
        <el-icon :size="44" class="empty-state-icon"><FolderAdd /></el-icon>
        <h2>{{ t('app.selector.emptyTitle') }}</h2>
        <p>{{ t('app.selector.emptyDesc') }}</p>
        <el-button type="primary" :icon="Plus" @click="openEditor()">{{
          t('app.selector.newApp')
        }}</el-button>
      </div>

      <draggable
        v-else
        v-model="applications"
        class="application-grid"
        tag="div"
        item-key="id"
        :animation="180"
        ghost-class="application-card-ghost"
        chosen-class="application-card-chosen"
        drag-class="application-card-drag"
        filter=".application-actions"
        :prevent-on-filter="false"
        :fallback-on-body="true"
        @change="handleApplicationOrderChange"
        @start="handleApplicationDragStart"
        @end="handleApplicationDragEnd"
      >
        <template #item="{ element: application, index }">
          <article
            class="application-card"
            :class="{
              selected: application.id === currentApplicationId,
              'application-card-dragging': application.id === draggingApplicationId,
            }"
            :style="{ '--application-accent': application.accent }"
            :data-application-id="application.id"
            :aria-label="application.name"
            tabindex="0"
            @click="$emit('select', application.id)"
            @keydown.enter="$emit('select', application.id)"
            @keydown.space.prevent="$emit('select', application.id)"
            @keydown="handleApplicationKeydown($event, index)"
          >
            <div class="application-icon" aria-hidden="true">
              <el-icon :size="24">
                <component :is="iconComponent(application.icon)" />
              </el-icon>
            </div>
            <div class="application-copy">
              <div class="application-title-row">
                <h2>{{ application.name }}</h2>
                <el-icon
                  v-if="application.id === currentApplicationId"
                  class="selected-icon"
                  :title="t('app.selector.currentApp')"
                >
                  <CircleCheckFilled />
                </el-icon>
              </div>
              <p>{{ application.description || t('app.selector.noDescription') }}</p>
              <div class="panel-list">
                <span
                  v-for="windowDefinition in applicationWindows(application)"
                  :key="windowDefinition.id"
                >
                  {{ t(windowDefinition.title) }}
                </span>
              </div>
            </div>
            <div class="application-actions">
              <el-button
                text
                circle
                :title="t('app.selector.openWindow')"
                :aria-label="t('app.selector.openWindow')"
                @click.stop="$emit('open-window', application.id)"
              >
                <el-icon><CopyDocument /></el-icon>
              </el-button>
              <el-button
                text
                circle
                :title="t('app.selector.editApp')"
                :aria-label="t('app.selector.editApp')"
                @click.stop="openEditor(application)"
              >
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button
                text
                circle
                :title="t('app.selector.deleteApp')"
                :aria-label="t('app.selector.deleteApp')"
                class="delete-button"
                @click.stop="confirmDelete(application)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </article>
        </template>
      </draggable>
    </section>

    <ApplicationEditor
      :open="editorOpen"
      :application="editingApplication"
      @save="handleSave"
      @cancel="editorOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'
import {
  CircleCheckFilled,
  Close,
  CopyDocument,
  Delete,
  Edit,
  FolderAdd,
  Grid,
  Plus,
  Refresh,
} from '@element-plus/icons-vue'
import type { UserApplication } from '@/settings/config'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { applicationIconComponents } from '@/settings/applicationIcons'
import ApplicationEditor from './ApplicationEditor.vue'
import { t } from '@/i18n'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [applicationId: string]
  'open-window': [applicationId: string]
}>()

const {
  applications,
  windowCatalog,
  currentApplicationId,
  saveApplication,
  deleteApplication,
  reorderApplications,
  saveApplicationOrder,
  resetApplications,
} = useApplicationSelector()

const editorOpen = ref(false)
const editingApplication = ref<UserApplication | undefined>(undefined)
const draggingApplicationId = ref<string | undefined>(undefined)
const selectorMessageBoxTarget = '.selector-backdrop'

const applicationWindows = (application: UserApplication) => {
  const catalogById = new Map(windowCatalog.map((window) => [window.id, window]))
  const windows: (typeof windowCatalog)[number][] = []
  for (const id of application.windowIds) {
    const window = catalogById.get(id)
    if (window) windows.push(window)
  }
  return windows
}

const iconComponent = (icon: string) =>
  applicationIconComponents[icon as UserApplication['icon']] ?? Grid

const openEditor = (application?: UserApplication) => {
  editingApplication.value = application
  editorOpen.value = true
}

const handleSave = (form: Omit<UserApplication, 'id'> & { id?: string }) => {
  const savedApplication = saveApplication(form)
  editorOpen.value = false
  emit('select', savedApplication.id)
}

const handleApplicationOrderChange = () => {
  saveApplicationOrder()
}

const handleApplicationDragStart = (event: { item?: HTMLElement }) => {
  draggingApplicationId.value = event.item?.dataset.applicationId
}

const handleApplicationDragEnd = () => {
  draggingApplicationId.value = undefined
}

const focusApplicationCard = (index: number) => {
  nextTick(() => {
    const cards = document
      .querySelector<HTMLElement>('.application-grid')
      ?.querySelectorAll<HTMLElement>('.application-card')
    cards?.[index]?.focus()
  })
}

const handleApplicationKeydown = (event: KeyboardEvent, index: number) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  if (!event.ctrlKey && !event.metaKey && !event.altKey) return

  const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= applications.value.length) return

  event.preventDefault()
  event.stopPropagation()
  reorderApplications(index, targetIndex)
  focusApplicationCard(targetIndex)
}

const confirmReset = async () => {
  try {
    await ElMessageBox.confirm(
      t('app.selector.resetConfirm'),
      t('app.selector.resetConfirmTitle'),
      {
        appendTo: selectorMessageBoxTarget,
        type: 'warning',
        confirmButtonText: t('app.selector.resetConfirmButton'),
        confirmButtonClass: 'el-button--danger',
        cancelButtonText: t('app.cancel'),
        customClass: 'app-message-box',
        closeOnClickModal: true,
        closeOnPressEscape: true,
      },
    )
  } catch {
    return
  }

  editorOpen.value = false
  editingApplication.value = undefined
  resetApplications()
}

const confirmDelete = async (application: UserApplication) => {
  try {
    await ElMessageBox.confirm(
      t('app.selector.deleteConfirm', { v: application.name }),
      t('app.selector.deleteConfirmTitle'),
      {
        appendTo: selectorMessageBoxTarget,
        type: 'warning',
        confirmButtonText: t('app.selector.deleteConfirmButton'),
        confirmButtonClass: 'el-button--danger',
        cancelButtonText: t('app.cancel'),
        customClass: 'app-message-box',
        closeOnClickModal: true,
        closeOnPressEscape: true,
      },
    )
  } catch {
    return
  }
  deleteApplication(application.id)
}

const handleEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || !props.open || editorOpen.value) return
  if (document.querySelector('.selector-backdrop > .el-overlay.is-message-box')) return
  emit('close')
}

onMounted(() => window.addEventListener('keydown', handleEscape, { capture: true }))
onUnmounted(() => window.removeEventListener('keydown', handleEscape, { capture: true }))
</script>

<style scoped>
.selector-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 24, 39, 0.56);
  backdrop-filter: blur(3px);
}

.selector-panel {
  display: flex;
  width: min(860px, 100%);
  max-height: min(680px, calc(100vh - 48px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-muted);
  box-shadow: 0 20px 50px var(--app-shadow);
}

.selector-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 26px 18px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  flex: none;
}

.selector-header h1 {
  margin: 0;
  color: var(--app-text);
  font-size: 22px;
  line-height: 1.3;
  letter-spacing: 0;
  text-align: left;
}

.selector-header p {
  margin: 6px 0 0;
  color: var(--app-text-muted);
  font-size: 14px;
  text-align: left;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 56px 24px;
  text-align: center;
  overflow-y: auto;
}

.empty-state-icon {
  color: var(--app-text-muted);
}

.empty-state h2 {
  margin: 0;
  color: var(--app-text);
  font-size: 17px;
}

.empty-state p {
  margin: 0 0 8px;
  color: var(--app-text-muted);
  font-size: 13px;
}

.application-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  padding: 20px;
  min-height: 0;
  overflow-y: auto;
}

.application-card {
  position: relative;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 32px;
  gap: 14px;
  min-height: 132px;
  padding: 16px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.application-card:hover,
.application-card:focus-visible {
  border-color: var(--application-accent);
  outline: none;
  box-shadow: 0 8px 20px var(--app-shadow);
  transform: translateY(-2px);
}

.application-card.selected {
  border-color: var(--application-accent);
  box-shadow: inset 3px 0 0 var(--application-accent);
}

/* Sortable animates the neighboring cards into the open space, while these
 * states make the dragged card feel lifted from the application grid. */
.application-card-ghost {
  opacity: 0.34;
  border-style: dashed;
  transform: scale(0.96);
}

.application-card-chosen {
  cursor: grabbing;
  box-shadow: 0 14px 32px var(--app-shadow);
}

.application-card-drag {
  cursor: grabbing;
  border-color: var(--application-accent);
  box-shadow: 0 18px 36px var(--app-shadow);
  transform: rotate(1deg) scale(1.025);
}

.application-card-dragging {
  cursor: grabbing;
}

.application-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  color: var(--application-accent);
  background: color-mix(in srgb, var(--application-accent) 12%, var(--app-surface));
}

.application-copy {
  min-width: 0;
}

.application-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.application-title-row h2 {
  margin: 0;
  color: var(--app-text);
  font-size: 16px;
  line-height: 1.4;
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-icon {
  color: var(--application-accent);
  flex-shrink: 0;
}

.application-copy p {
  margin: 6px 0 12px;
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.55;
  text-align: left;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.panel-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.panel-list span {
  padding: 3px 7px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text-secondary);
  background: var(--app-surface-muted);
  font-size: 12px;
}

.application-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--app-text-muted);
}

.application-actions .el-button + .el-button {
  margin-left: 0;
}

.delete-button:hover {
  color: #ef4444;
}

@media (max-width: 680px) {
  .selector-backdrop {
    padding: 12px;
  }

  .application-grid {
    grid-template-columns: minmax(0, 1fr);
    padding: 14px;
  }

  .selector-header {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
  }

  .selector-header h1 {
    font-size: 20px;
    white-space: nowrap;
  }

  .selector-header p {
    margin-top: 4px;
    line-height: 1.45;
  }

  .header-actions {
    width: 100%;
    gap: 8px;
  }

  .header-actions > .el-button {
    margin-left: 0;
  }

  .header-actions > .el-button:not(.is-circle) {
    min-width: 0;
    flex: 1;
  }
}
</style>
