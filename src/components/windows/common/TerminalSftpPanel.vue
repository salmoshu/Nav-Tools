<template>
  <aside class="sftp-panel" @dragover.prevent @drop.prevent="handleDrop">
    <div class="sftp-toolbar">
      <el-button text size="small" :disabled="loading || currentPath === '/'" @click="goUp">
        <el-icon><ArrowUp /></el-icon>
      </el-button>
      <el-input v-model="pathInput" size="small" @keyup.enter="navigate(pathInput)" />
      <el-button text size="small" :loading="loading" @click="refresh">
        <el-icon><Refresh /></el-icon>
      </el-button>
    </div>
    <div class="sftp-actions">
      <el-button size="small" @click="chooseUpload"
        ><el-icon><Upload /></el-icon>{{ t('common.terminal.upload') }}</el-button
      >
      <el-button size="small" @click="createDirectory"
        ><el-icon><FolderAdd /></el-icon>{{ t('common.terminal.newFolder') }}</el-button
      >
    </div>

    <el-table
      v-loading="loading"
      :data="entries"
      size="small"
      height="100%"
      class="sftp-table"
      @row-dblclick="openEntry"
    >
      <el-table-column width="34">
        <template #default="scope">
          <el-icon><Folder v-if="scope.row.directory" /><Document v-else /></el-icon>
        </template>
      </el-table-column>
      <el-table-column
        prop="name"
        :label="t('common.terminal.name')"
        min-width="130"
        show-overflow-tooltip
      />
      <el-table-column :label="t('common.terminal.size')" width="84" align="right">
        <template #default="scope">{{
          scope.row.directory ? '' : formatSize(scope.row.size)
        }}</template>
      </el-table-column>
      <el-table-column width="94" align="right">
        <template #default="scope">
          <el-button text size="small" @click.stop="download(scope.row)"
            ><el-icon><Download /></el-icon
          ></el-button>
          <el-dropdown
            trigger="click"
            @command="(command: string) => rowCommand(command, scope.row)"
          >
            <el-button text size="small"
              ><el-icon><More /></el-icon
            ></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rename">{{
                  t('common.terminal.rename')
                }}</el-dropdown-item>
                <el-dropdown-item command="delete" divided>{{
                  t('common.terminal.delete')
                }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="transfer" class="transfer-status">
      <span>{{ transfer.name }}</span>
      <el-progress
        :percentage="transferPercent"
        :status="
          transfer.status === 'error'
            ? 'exception'
            : transfer.status === 'success'
              ? 'success'
              : undefined
        "
        :show-text="false"
      />
    </div>
    <div class="drop-hint">{{ t('common.terminal.sftpDropHint') }}</div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowUp,
  Document,
  Download,
  Folder,
  FolderAdd,
  More,
  Refresh,
  Upload,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { t } from '@/i18n'
import type { SftpEntry, SftpTransferEvent } from '@/core/terminal/TerminalTypes'

const props = defineProps<{ sessionId: string }>()
const currentPath = ref('.')
const pathInput = ref('.')
const entries = ref<SftpEntry[]>([])
const loading = ref(false)
const transfer = ref<SftpTransferEvent | null>(null)
const transferPercent = computed(() => {
  if (!transfer.value || transfer.value.total <= 0) return 0
  return Math.round((transfer.value.transferred / transfer.value.total) * 100)
})

async function refresh(): Promise<void> {
  loading.value = true
  try {
    entries.value = await window.ipcRenderer.invoke('terminal-sftp-list', {
      sessionId: props.sessionId,
      path: currentPath.value,
    })
    pathInput.value = currentPath.value
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

async function navigate(target: string): Promise<void> {
  currentPath.value = normalizeRemotePath(target)
  await refresh()
}

function goUp(): void {
  void navigate(remoteParent(currentPath.value))
}

function openEntry(entry: SftpEntry): void {
  if (entry.directory) void navigate(entry.path)
}

async function chooseUpload(): Promise<void> {
  const selected = await window.ipcRenderer.invoke('terminal-sftp-choose-upload')
  if (Array.isArray(selected) && selected.length > 0) await uploadPaths(selected)
}

async function uploadPaths(paths: string[]): Promise<void> {
  const existing = new Set(entries.value.map((entry) => entry.name.toLowerCase()))
  const conflicts = paths.map(localBaseName).filter((name) => existing.has(name.toLowerCase()))
  if (conflicts.length > 0) {
    await ElMessageBox.confirm(
      t('common.terminal.overwriteConfirm', { names: conflicts.join(', ') }),
      t('common.terminal.overwrite'),
      { type: 'warning' },
    )
  }
  try {
    await window.ipcRenderer.invoke('terminal-sftp-upload', {
      sessionId: props.sessionId,
      localPaths: paths,
      remoteDirectory: currentPath.value,
    })
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function download(entry: SftpEntry): Promise<void> {
  const localPath = await window.ipcRenderer.invoke('terminal-sftp-choose-download', {
    name: entry.name,
    directory: entry.directory,
  })
  if (!localPath) return
  try {
    await window.ipcRenderer.invoke('terminal-sftp-download', {
      sessionId: props.sessionId,
      remotePath: entry.path,
      localPath,
    })
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function createDirectory(): Promise<void> {
  try {
    const result = await ElMessageBox.prompt(
      t('common.terminal.folderName'),
      t('common.terminal.newFolder'),
    )
    const target = joinRemote(currentPath.value, result.value)
    if (entries.value.some((entry) => entry.name === result.value)) {
      await ElMessageBox.confirm(
        t('common.terminal.overwriteFolderConfirm'),
        t('common.terminal.overwrite'),
        { type: 'warning' },
      )
    }
    await window.ipcRenderer.invoke('terminal-sftp-mkdir', {
      sessionId: props.sessionId,
      path: target,
    })
    await refresh()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(errorMessage(error))
  }
}

function rowCommand(command: string, entry: SftpEntry): void {
  if (command === 'rename') void renameEntry(entry)
  if (command === 'delete') void deleteEntry(entry)
}

async function renameEntry(entry: SftpEntry): Promise<void> {
  try {
    const result = await ElMessageBox.prompt(
      t('common.terminal.newName'),
      t('common.terminal.rename'),
      { inputValue: entry.name },
    )
    const target = joinRemote(currentPath.value, result.value)
    if (
      entries.value.some(
        (candidate) => candidate.name === result.value && candidate.path !== entry.path,
      )
    ) {
      await ElMessageBox.confirm(
        t('common.terminal.renameOverwriteConfirm'),
        t('common.terminal.overwrite'),
        { type: 'warning' },
      )
    }
    await window.ipcRenderer.invoke('terminal-sftp-rename', {
      sessionId: props.sessionId,
      oldPath: entry.path,
      newPath: target,
    })
    await refresh()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(errorMessage(error))
  }
}

async function deleteEntry(entry: SftpEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(
      entry.directory
        ? t('common.terminal.deleteDirectoryConfirm', { name: entry.name })
        : t('common.terminal.deleteFileConfirm', { name: entry.name }),
      t('common.terminal.delete'),
      { type: 'warning' },
    )
    await window.ipcRenderer.invoke('terminal-sftp-remove', {
      sessionId: props.sessionId,
      path: entry.path,
    })
    await refresh()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(errorMessage(error))
  }
}

function handleDrop(event: DragEvent): void {
  const paths = Array.from(event.dataTransfer?.files ?? [])
    .map((file) => window.electronAPI?.getPathForFile(file))
    .filter((value): value is string => Boolean(value))
  if (paths.length > 0) void uploadPaths(paths)
}

function handleTransfer(_event: unknown, event: SftpTransferEvent): void {
  if (event.sessionId === props.sessionId) transfer.value = event
}

watch(
  () => props.sessionId,
  () => void refresh(),
)
onMounted(() => {
  window.ipcRenderer?.on('terminal-sftp-transfer', handleTransfer)
  void refresh()
})
onUnmounted(() => window.ipcRenderer?.off('terminal-sftp-transfer', handleTransfer))

function normalizeRemotePath(value: string): string {
  const absolute = value.trim().startsWith('/')
  const parts = value
    .trim()
    .split('/')
    .filter((part) => part && part !== '.')
  const normalized: string[] = []
  for (const part of parts) part === '..' ? normalized.pop() : normalized.push(part)
  if (absolute) return `/${normalized.join('/')}` || '/'
  return normalized.join('/') || '.'
}
function joinRemote(base: string, name: string): string {
  return normalizeRemotePath(`${base === '/' ? '' : base}/${name}`)
}
function remoteParent(value: string): string {
  if (value === '/' || value === '.') return value
  const parts = value.split('/').filter(Boolean)
  parts.pop()
  return value.startsWith('/') ? `/${parts.join('/')}` || '/' : parts.join('/') || '.'
}
function localBaseName(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).pop() || value
}
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
</script>

<style scoped>
.sftp-panel {
  width: min(360px, 45%);
  min-width: 250px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--app-border);
  background: var(--app-surface);
  overflow: hidden;
}
.sftp-toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  padding: 6px;
  border-bottom: 1px solid var(--app-border);
}
.sftp-actions {
  display: flex;
  gap: 6px;
  padding: 6px;
}
.sftp-table {
  flex: 1;
  min-height: 0;
}
.transfer-status {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 100px;
  gap: 8px;
  align-items: center;
  padding: 5px 8px;
  font-size: 11px;
  border-top: 1px solid var(--app-border);
}
.drop-hint {
  padding: 4px 8px;
  color: var(--app-text-muted);
  font-size: 10px;
  text-align: center;
  border-top: 1px solid var(--app-border);
}
</style>
