<template>
  <el-dialog
    :model-value="open"
    :title="application ? '编辑应用' : '新建应用'"
    class="application-editor-dialog"
    width="min(640px, calc(100vw - 32px))"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    :z-index="3100"
    @close="handleCancel"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <el-form-item label="名称" prop="name">
        <el-input
          v-model="form.name"
          placeholder="例如：巡检工作台"
          maxlength="30"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          placeholder="这组窗口用来做什么"
          maxlength="80"
        />
      </el-form-item>

      <el-form-item label="图标" prop="icon">
        <div class="icon-options" role="radiogroup" aria-label="应用图标">
          <button
            v-for="option in iconOptions"
            :key="option.value"
            type="button"
            class="icon-option"
            :class="{ selected: form.icon === option.value }"
            :title="option.label"
            :aria-pressed="form.icon === option.value"
            @click="form.icon = option.value"
          >
            <el-icon :size="20"
              ><component :is="applicationIconComponents[option.value]"
            /></el-icon>
          </button>
        </div>
      </el-form-item>

      <el-form-item label="主题色" prop="accent">
        <el-color-picker
          v-model="form.accent"
          :predefine="accentPresets"
          :teleported="false"
          popper-class="application-color-picker-popper"
        />
      </el-form-item>

      <el-form-item label="包含窗口（至少 1 个）" prop="windowIds">
        <el-select
          v-if="windowGroups.length > 0"
          v-model="form.windowIds"
          multiple
          collapse-tags
          :collapse-tags-tooltip="true"
          :max-collapse-tags="4"
          :teleported="false"
          placeholder="选择要包含的窗口"
          class="window-select"
          popper-class="application-window-popper"
        >
          <el-option-group
            v-for="group in windowGroups"
            :key="group.funcMode"
            :label="formatFuncMode(group.funcMode)"
          >
            <el-option
              v-for="windowDefinition in group.windows"
              :key="windowDefinition.id"
              :value="windowDefinition.id"
              :label="windowDefinition.title"
            >
              <div class="window-option">
                <span class="window-option-icon" :class="`mode-${windowDefinition.funcMode}`">
                  <el-icon :size="18">
                    <component :is="getPanelIconComponent(windowDefinition.action)" />
                  </el-icon>
                </span>
                <span class="window-option-copy">
                  <span class="window-option-title">{{ windowDefinition.title }}</span>
                  <span class="window-option-subtitle">{{ windowDefinition.description }}</span>
                </span>
                <span class="window-option-mode">{{
                  formatFuncMode(windowDefinition.funcMode)
                }}</span>
              </div>
            </el-option>
          </el-option-group>
        </el-select>
        <el-alert
          v-else
          title="没有可用窗口，请检查窗口目录配置"
          type="error"
          :closable="false"
          show-icon
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" :icon="Check" @click="handleSave">
        {{ application ? '保存修改' : '创建应用' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Check } from '@element-plus/icons-vue'
import type { FormInstance, FormItemRule, FormRules } from 'element-plus'
import type { UserApplication, WindowDefinition } from '@/settings/config'
import { useApplicationSelector } from '@/composables/useApplicationSelector'
import { applicationIconComponents, applicationIconOptions } from '@/settings/applicationIcons'
import { getPanelIconComponent } from '@/settings/panelIcons'

type ApplicationForm = Omit<UserApplication, 'id'> & { id?: string }

const props = defineProps<{
  open: boolean
  application?: UserApplication
}>()

const emit = defineEmits<{
  save: [application: ApplicationForm]
  cancel: []
}>()

const { windowCatalog } = useApplicationSelector()

const formRef = ref<FormInstance>()
const form = reactive<ApplicationForm>({
  name: '',
  description: '',
  icon: 'grid',
  accent: '#3b82f6',
  windowIds: [],
})

const iconOptions = applicationIconOptions
const accentPresets = [
  '#3b82f6',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#8b5cf6',
  '#64748b',
]

const funcModeNames: Record<string, string> = {
  general: '通用',
  flow: 'Flow',
  gnss: 'GNSS',
  motor: 'Motor',
}

const formatFuncMode = (funcMode: string) =>
  funcModeNames[funcMode] ?? funcMode.charAt(0).toUpperCase() + funcMode.slice(1)

const windowGroups = computed(() => {
  const groups = new Map<string, WindowDefinition[]>()
  for (const windowDefinition of windowCatalog) {
    const windows = groups.get(windowDefinition.funcMode) ?? []
    windows.push(windowDefinition)
    groups.set(windowDefinition.funcMode, windows)
  }
  return [...groups.entries()].map(([funcMode, windows]) => ({ funcMode, windows }))
})

const validateWindowIds: FormItemRule['validator'] = (_rule, value, callback) => {
  if (!Array.isArray(value) || value.length === 0) {
    callback(new Error('请至少选择 1 个窗口'))
  } else {
    callback()
  }
}

const rules: FormRules<ApplicationForm> = {
  name: [{ required: true, message: '请输入应用名称', trigger: 'blur' }],
  windowIds: [{ validator: validateWindowIds, trigger: 'change' }],
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    formRef.value?.resetFields()
    if (props.application) {
      form.id = props.application.id
      form.name = props.application.name
      form.description = props.application.description
      form.icon = props.application.icon
      form.accent = props.application.accent
      form.windowIds = [...props.application.windowIds]
    } else {
      form.id = undefined
      form.name = ''
      form.description = ''
      form.icon = 'grid'
      form.accent = '#3b82f6'
      form.windowIds = []
    }
  },
)

const handleCancel = () => {
  emit('cancel')
}

const handleSave = async () => {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  emit('save', {
    id: form.id,
    name: form.name,
    description: form.description,
    icon: form.icon,
    accent: form.accent,
    windowIds: [...form.windowIds],
  })
}
</script>

<style scoped>
.icon-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, 40px);
  gap: 7px;
  width: 100%;
  max-height: 142px;
  padding: 8px;
  overflow-y: auto;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
  box-sizing: border-box;
}

.icon-option {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text-secondary);
  background: var(--app-surface);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background-color 160ms ease;
}

.icon-option:hover {
  border-color: var(--app-border-strong);
}

.icon-option.selected {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, var(--app-surface));
}

.window-select {
  width: 100%;
}

.window-option {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 6px 2px;
  box-sizing: border-box;
}

.window-option-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: #64748b;
  background: #eef2f7;
}

.window-option-icon.mode-flow {
  color: #0f8f80;
  background: #e5f7f3;
}
.window-option-icon.mode-gnss {
  color: #0284c7;
  background: #e6f5fc;
}
.window-option-icon.mode-motor {
  color: #ea580c;
  background: #fff0e8;
}

.window-option-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  line-height: 1.35;
  text-align: left;
}

.window-option-title {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
}

.window-option-subtitle {
  color: var(--app-text-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window-option-mode {
  padding: 2px 7px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  color: var(--app-text-muted);
  background: var(--app-surface);
  font-size: 10px;
  line-height: 1.5;
}

:deep(.application-window-popper .el-select-dropdown__item) {
  height: auto;
  min-height: 62px;
  padding: 2px 12px;
}

:deep(.application-window-popper) {
  z-index: 9001 !important;
  border-color: var(--app-border);
  background: var(--app-surface-raised);
  box-shadow: 0 14px 34px var(--app-shadow);
}

:deep(.application-window-popper .el-select-dropdown) {
  background: var(--app-surface-raised);
}

:deep(.application-window-popper .el-select-group__title) {
  height: 30px;
  padding-top: 7px;
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

:deep(.application-color-picker-popper) {
  z-index: 9001 !important;
}
</style>
