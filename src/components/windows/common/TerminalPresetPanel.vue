<template>
  <aside class="preset-panel">
    <header class="preset-panel__bar">
      <span class="preset-panel__title">{{ t('common.terminal.presetPanel') }}</span>
      <el-button text size="small" @click="beginCreate">
        <el-icon><Plus /></el-icon>
      </el-button>
    </header>

    <div class="preset-panel__body">
      <p v-if="presets.length === 0" class="preset-panel__empty">
        {{ t('common.terminal.presetEmpty') }}
      </p>
      <ul v-else class="preset-list">
        <li v-for="preset in presets" :key="preset.id" class="preset-item">
          <div class="preset-item__text">
            <span class="preset-item__name" :title="preset.name">{{ preset.name }}</span>
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
            <el-button text size="small" @click="beginEdit(preset)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button text size="small" @click="remove(preset)">
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
        <el-form-item :label="t('common.terminal.presetCwd')">
          <el-input v-model="form.cwd" :placeholder="t('common.terminal.presetCwdHint')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.terminal.cancel') }}</el-button>
        <el-button type="primary" @click="commit">{{ t('common.terminal.save') }}</el-button>
      </template>
    </el-dialog>
  </aside>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { CaretRight, Delete, Edit, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { t } from '@/i18n'
import { buildShellCommand, shellFamilyFor } from '@/core/terminal/ShellQuote'
import {
  TerminalPresetStorage,
  createTerminalPreset,
  type TerminalPresetCommand,
} from '@/core/terminal/TerminalPresetStorage'
import type { LocalShellKind, TerminalSessionKind } from '@/core/terminal/TerminalTypes'

const props = defineProps<{
  /** 运行目标:为空(没有就绪会话)时只允许增删改,不允许运行 */
  sessionId?: string
  kind: TerminalSessionKind
  localShell?: LocalShellKind
}>()

const storage = new TerminalPresetStorage(localStorage)
const presets = ref<TerminalPresetCommand[]>(storage.list())
const dialogVisible = ref(false)
const editing = ref(false)
const form = reactive({ id: '', name: '', command: '', cwd: '' })

function beginCreate(): void {
  editing.value = false
  Object.assign(form, createTerminalPreset())
  dialogVisible.value = true
}

function beginEdit(preset: TerminalPresetCommand): void {
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
  presets.value = storage.list()
  dialogVisible.value = false
}

async function remove(preset: TerminalPresetCommand): Promise<void> {
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
  presets.value = storage.list()
}

/**
 * 把预设写进会话。命令与工作目录都是用户输入,可能含空格/引号/分号,
 * 必须按目标 shell 家族转义后再拼,否则 `cd` 会被截断成注入入口。
 */
async function run(preset: TerminalPresetCommand): Promise<void> {
  if (!props.sessionId) return
  const command = buildShellCommand(
    preset.command,
    preset.cwd,
    shellFamilyFor(props.kind, props.localShell),
  )
  if (!command) return
  try {
    await window.ipcRenderer.invoke('terminal-session-write', {
      sessionId: props.sessionId,
      data: `${command}\r`,
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
.preset-item__name {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.preset-item:hover .preset-item__actions,
.preset-item:focus-within .preset-item__actions {
  opacity: 1;
}
</style>
