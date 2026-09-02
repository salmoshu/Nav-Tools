<template>
  <aside class="preset-panel">
    <header class="preset-panel__bar">
      <span class="preset-panel__title">{{ t('common.terminal.presetPanel') }}</span>
      <el-button text size="small" @click="beginCreate">
        <el-icon><Plus /></el-icon>
      </el-button>
    </header>

    <div class="preset-panel__body">
      <p v-if="projectPresetIssue" class="preset-panel__notice">
        {{ t('common.terminal.presetProjectLoadFailed') }}
      </p>
      <p v-if="presets.length === 0" class="preset-panel__empty">
        {{ t('common.terminal.presetEmpty') }}
      </p>
      <ul v-else class="preset-list">
        <li v-for="preset in presets" :key="preset.id" class="preset-item">
          <div class="preset-item__text">
            <div class="preset-item__heading">
              <span class="preset-item__name" :title="preset.name">{{ preset.name }}</span>
              <span class="preset-item__scope">
                {{
                  t(
                    preset.scope === 'project'
                      ? 'common.terminal.presetScopeProject'
                      : 'common.terminal.presetScopeGlobal',
                  )
                }}
              </span>
            </div>
            <code class="preset-item__command" :title="preset.command">{{ preset.command }}</code>
            <span v-if="preset.cwd" class="preset-item__cwd" :title="preset.cwd">{{
              preset.cwd
            }}</span>
          </div>
          <div class="preset-item__actions">
            <el-tooltip :content="t('common.terminal.presetRun')" placement="left">
              <el-button text size="small" :disabled="!props.sessionId" @click="run(preset)">
                <el-icon><CaretRight /></el-icon>
              </el-button>
            </el-tooltip>
            <el-button
              v-if="preset.scope === 'global'"
              text
              size="small"
              @click="beginEdit(preset)"
            >
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button v-if="preset.scope === 'global'" text size="small" @click="remove(preset)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </li>
      </ul>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? t('common.terminal.presetEdit') : t('common.terminal.presetAdd')"
      width="440px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form label-width="84px" @submit.prevent>
        <el-form-item :label="t('common.terminal.presetName')">
          <el-input v-model="form.name" maxlength="60" />
        </el-form-item>
        <el-form-item :label="t('common.terminal.presetCommand')">
          <el-input v-model="form.command" type="textarea" :rows="3" />
        </el-form-item>
        <p class="preset-hint">{{ t('common.terminal.presetCommandHint') }}</p>
        <el-form-item :label="t('common.terminal.presetCwd')">
          <el-input v-model="form.cwd" :placeholder="t('common.terminal.presetCwdHint')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.terminal.cancel') }}</el-button>
        <el-button type="primary" @click="commit">{{ t('common.terminal.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 命令带 {{...}} 占位符时先收参数;转义在主进程按会话 shell 家族做 -->
    <el-dialog
      v-model="paramDialogVisible"
      :title="t('common.terminal.presetParameters')"
      width="420px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form label-width="90px" @submit.prevent>
        <el-form-item v-for="field in paramFields" :key="field.name" :label="field.name">
          <el-checkbox
            v-if="field.type === 'boolean'"
            v-model="paramValues[field.name]"
            true-value="true"
            false-value="false"
          >
            {{ t('common.terminal.presetBooleanEnabled') }}
          </el-checkbox>
          <el-select
            v-else-if="field.type === 'select'"
            v-model="paramValues[field.name]"
            :placeholder="field.defaultValue"
          >
            <el-option
              v-for="option in field.options"
              :key="option"
              :label="option"
              :value="option"
            />
          </el-select>
          <el-input v-else v-model="paramValues[field.name]" :placeholder="field.defaultValue" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="paramDialogVisible = false">{{ t('common.terminal.cancel') }}</el-button>
        <el-button type="primary" @click="runWithParameters">
          {{ t('common.terminal.presetRun') }}
        </el-button>
      </template>
    </el-dialog>
  </aside>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CaretRight, Delete, Edit, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { decodeBase64Text } from '@/core/terminal/CommandBlocks'
import { parseCommandTemplate } from '@/core/terminal/CommandTemplate'
import { useTerminalTranslate } from '@/core/terminal/TerminalI18n'
import {
  TERMINAL_PROJECT_PRESET_MAX_BYTES,
  TERMINAL_PROJECT_PRESET_PATH,
  TerminalPresetStorage,
  createTerminalPreset,
  mergeTerminalPresets,
  parseTerminalProjectPresets,
  type TerminalPresetCommand,
} from '@/core/terminal/TerminalPresetStorage'
import type { TerminalPathRead } from '@/core/terminal/TerminalTypes'

const t = useTerminalTranslate()

const props = defineProps<{
  /** 运行目标:为空(没有就绪会话)时只允许增删改,不允许运行 */
  sessionId?: string
  /** 仅用于在会话 cwd 变化时重新装载项目配置；实际路径解析仍由主进程完成 */
  projectCwd?: string
}>()

const storage = new TerminalPresetStorage(localStorage)
const globalPresets = ref<TerminalPresetCommand[]>(storage.list())
const projectPresets = ref<TerminalPresetCommand[]>([])
const presets = computed(() => mergeTerminalPresets(globalPresets.value, projectPresets.value))
const projectPresetIssue = ref(false)
const dialogVisible = ref(false)
const editing = ref(false)
const form = reactive({ id: '', name: '', command: '', cwd: '' })
const paramDialogVisible = ref(false)
const paramFields = ref(parseCommandTemplate(''))
/** 上次填过的参数值,下次打开表单时回填(仅内存,不做持久化) */
const lastValuesByPresetId = new Map<string, Record<string, string>>()
let paramTarget: TerminalPresetCommand | null = null
const paramValues = reactive<Record<string, string>>({})
let projectLoadGeneration = 0

watch(
  [() => props.sessionId, () => props.projectCwd],
  () => {
    void loadProjectPresets()
  },
  { immediate: true },
)

async function loadProjectPresets(): Promise<void> {
  const generation = ++projectLoadGeneration
  projectPresets.value = []
  projectPresetIssue.value = false
  if (paramTarget?.scope === 'project') {
    paramTarget = null
    paramDialogVisible.value = false
  }
  if (!props.sessionId || !props.projectCwd) return
  try {
    const result = (await window.ipcRenderer.invoke('terminal-path-read', {
      sessionId: props.sessionId,
      path: TERMINAL_PROJECT_PRESET_PATH,
      maxBytes: TERMINAL_PROJECT_PRESET_MAX_BYTES,
    })) as TerminalPathRead | null
    if (generation !== projectLoadGeneration || !result) return
    if (result.truncated) {
      projectPresetIssue.value = true
      return
    }
    projectPresets.value = parseTerminalProjectPresets(decodeBase64Text(result.data))
  } catch {
    if (generation === projectLoadGeneration) projectPresetIssue.value = true
  }
}

function beginCreate(): void {
  editing.value = false
  Object.assign(form, createTerminalPreset())
  dialogVisible.value = true
}

function beginEdit(preset: TerminalPresetCommand): void {
  if (preset.scope !== 'global') return
  editing.value = true
  Object.assign(form, {
    id: preset.id,
    name: preset.name,
    command: preset.command,
    cwd: preset.cwd ?? '',
  })
  dialogVisible.value = true
}

function commit(): void {
  try {
    storage.save({ id: form.id, name: form.name, command: form.command, cwd: form.cwd })
  } catch {
    ElMessage.error(t('common.terminal.presetNameRequired'))
    return
  }
  globalPresets.value = storage.list()
  dialogVisible.value = false
}

async function remove(preset: TerminalPresetCommand): Promise<void> {
  if (preset.scope !== 'global') return
  try {
    await ElMessageBox.confirm(
      t('common.terminal.presetDeleteConfirm', { name: preset.name }),
      t('common.terminal.presetDelete'),
      { type: 'warning', customClass: 'app-message-box' },
    )
  } catch {
    return
  }
  storage.remove(preset.id)
  globalPresets.value = storage.list()
}

/**
 * 运行预设。无参数占位符时直接执行;有则先弹表单收参数。
 *
 * 转义不在渲染层做——命令原样与参数值一起交给主进程的
 * `terminal-session-run-command`,由主进程按**会话自己的** shell 家族转义后写入。
 * 这样渲染层既不需要知道 shell 家族,也没有漏转义的机会。
 */
async function run(preset: TerminalPresetCommand): Promise<void> {
  if (!props.sessionId) return
  const fields = parseCommandTemplate(preset.command)
  if (fields.length === 0) {
    await execute(preset, {})
    return
  }
  paramTarget = preset
  paramFields.value = fields
  const previous = lastValuesByPresetId.get(preset.id) ?? {}
  for (const key of Object.keys(paramValues)) delete paramValues[key]
  for (const field of fields) {
    paramValues[field.name] = previous[field.name] ?? field.defaultValue
  }
  paramDialogVisible.value = true
}

function runWithParameters(): void {
  const preset = paramTarget
  if (!preset) return
  lastValuesByPresetId.set(preset.id, { ...paramValues })
  paramDialogVisible.value = false
  void execute(preset, { ...paramValues })
}

async function execute(
  preset: TerminalPresetCommand,
  values: Record<string, string>,
): Promise<void> {
  if (!props.sessionId) return
  try {
    await window.ipcRenderer.invoke('terminal-session-run-command', {
      sessionId: props.sessionId,
      command: preset.command,
      cwd: preset.cwd,
      values,
    })
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
</script>

<style scoped>
.preset-panel {
  width: 260px;
  min-width: 200px;
  max-width: min(460px, 60%);
  display: flex;
  flex: none;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid var(--app-border);
  background: var(--app-surface);
  resize: horizontal;
}
.preset-panel__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 4px 10px;
  border-bottom: 1px solid var(--app-border);
}
.preset-panel__title {
  font-size: 12px;
  font-weight: 600;
}
.preset-panel__body {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.preset-panel__empty {
  margin: 0;
  padding: 12px 10px;
  color: var(--app-text-muted);
  font-size: 11px;
  line-height: 1.6;
}
.preset-panel__notice {
  margin: 0;
  padding: 8px 10px;
  color: var(--el-color-warning);
  font-size: 10px;
  line-height: 1.5;
  border-bottom: 1px solid var(--app-border);
}
.preset-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.preset-item {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 6px 6px 6px 10px;
  border-bottom: 1px solid var(--app-border);
}
.preset-item:hover {
  background: var(--app-hover);
}
.preset-item__text {
  min-width: 0;
  flex: 1;
  display: grid;
}
.preset-item__heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
}
.preset-item__name {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preset-item__scope {
  flex: none;
  padding: 0 4px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  color: var(--app-text-muted);
  font-size: 9px;
  line-height: 14px;
}
.preset-item__command {
  overflow: hidden;
  color: var(--app-text-secondary);
  font-family: 'Cascadia Mono', Consolas, 'Noto Sans Mono', monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preset-item__cwd {
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preset-item__actions {
  display: flex;
  flex: none;
  gap: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.preset-hint {
  margin: -6px 0 12px 84px;
  color: var(--app-text-muted);
  font-size: 10px;
  line-height: 1.5;
}
.preset-item:hover .preset-item__actions,
.preset-item:focus-within .preset-item__actions {
  opacity: 1;
}
</style>
