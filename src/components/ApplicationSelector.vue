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
          <h1 id="application-selector-title">选择应用</h1>
          <p>选择一组工具面板进入工作区</p>
        </div>
        <div class="header-actions">
          <el-button v-if="applications.length > 0" :icon="Plus" @click="openEditor()">
            新建应用
          </el-button>
          <el-button v-if="applications.length > 0" :icon="Refresh" @click="confirmReset">
            重置应用
          </el-button>
          <el-button
            v-if="currentApplicationId"
            text
            circle
            title="关闭应用选择器"
            aria-label="关闭应用选择器"
            @click="$emit('close')"
          >
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </header>

      <div v-if="applications.length === 0" class="empty-state">
        <el-icon :size="44" class="empty-state-icon"><FolderAdd /></el-icon>
        <h2>还没有应用</h2>
        <p>创建你的第一个应用，自由组合所需的窗口</p>
        <el-button type="primary" :icon="Plus" @click="openEditor()">新建应用</el-button>
      </div>

      <div v-else class="application-grid">
        <article
          v-for="application in applications"
          :key="application.id"
          class="application-card"
          :class="{ selected: application.id === currentApplicationId }"
          :style="{ '--application-accent': application.accent }"
          tabindex="0"
          @click="$emit('select', application.id)"
          @keydown.enter="$emit('select', application.id)"
          @keydown.space.prevent="$emit('select', application.id)"
        >
          <div class="application-icon" aria-hidden="true">
            <el-icon :size="24">
              <component :is="applicationIconComponents[application.icon] ?? Grid" />
            </el-icon>
          </div>
          <div class="application-copy">
            <div class="application-title-row">
              <h2>{{ application.name }}</h2>
              <el-icon
                v-if="application.id === currentApplicationId"
                class="selected-icon"
                title="当前应用"
              >
                <CircleCheckFilled />
              </el-icon>
            </div>
            <p>{{ application.description || '无描述' }}</p>
            <div class="panel-list">
              <span
                v-for="windowDefinition in applicationWindows(application)"
                :key="windowDefinition.id"
              >
                {{ windowDefinition.title }}
              </span>
            </div>
          </div>
          <div class="application-actions">
            <el-button
              text
              circle
              title="在新窗口打开"
              aria-label="在新窗口打开"
              @click.stop="$emit('open-window', application.id)"
            >
              <el-icon><CopyDocument /></el-icon>
            </el-button>
            <el-button
              text
              circle
              title="编辑应用"
              aria-label="编辑应用"
              @click.stop="openEditor(application)"
            >
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button
              text
              circle
              title="删除应用"
              aria-label="删除应用"
              class="delete-button"
              @click.stop="confirmDelete(application)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </article>
      </div>
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
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
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
  resetApplications,
} = useApplicationSelector()

const editorOpen = ref(false)
const editingApplication = ref<UserApplication | undefined>(undefined)
const selectorMessageBoxTarget = '.selector-backdrop'

const applicationWindows = (application: UserApplication) => {
  const requestedIds = new Set(application.windowIds)
  return windowCatalog.filter((windowDefinition) => requestedIds.has(windowDefinition.id))
}

const openEditor = (application?: UserApplication) => {
  editingApplication.value = application
  editorOpen.value = true
}

const handleSave = (form: Omit<UserApplication, 'id'> & { id?: string }) => {
  const savedApplication = saveApplication(form)
  editorOpen.value = false
  emit('select', savedApplication.id)
}

const confirmReset = async () => {
  try {
    await ElMessageBox.confirm(
      '该操作会删除所有自定义应用和对应用的编辑，只保留默认的 GNSS、Motor 和 Camera 应用。重置后不可恢复，确定继续吗？',
      '重置应用',
      {
        appendTo: selectorMessageBoxTarget,
        type: 'warning',
        confirmButtonText: '重置应用',
        cancelButtonText: '取消',
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
      `删除后不可恢复，确定删除应用「${application.name}」吗？`,
      '删除应用',
      {
        appendTo: selectorMessageBoxTarget,
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
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
  width: min(860px, 100%);
  max-height: min(680px, calc(100vh - 48px));
  overflow: auto;
  border: 1px solid var(--app-border);
  border-radius: 8px;
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
    padding: 18px;
  }
}
</style>
