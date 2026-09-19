<template>
  <div class="terminal-file-tree">
    <div v-if="truncatedEntryCount !== null" class="terminal-file-tree__truncated" role="status">
      {{ t('common.terminal.fileTreeTruncated', { count: truncatedEntryCount }) }}
    </div>
    <el-tree
      :key="treeKey"
      class="terminal-file-tree__tree"
      :props="treeProps"
      :load="loadNode"
      node-key="path"
      lazy
      highlight-current
      :default-expanded-keys="expandedKeys"
      @node-expand="rememberExpanded"
      @node-collapse="forgetExpanded"
      @node-click="emit('node-click', $event)"
    >
      <template #default="{ data }">
        <el-dropdown
          trigger="contextmenu"
          @command="(command: string) => onNodeCommand(command, data)"
        >
          <span class="terminal-file-tree__node">
            <el-icon class="terminal-file-tree__icon">
              <Folder v-if="data.directory" />
              <Document v-else />
            </el-icon>
            <span class="terminal-file-tree__name">{{ data.name }}</span>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="download">
                {{ t('common.terminal.fileTreeDownload') }}
              </el-dropdown-item>
              <el-dropdown-item command="copy-path" divided>
                {{ t('common.terminal.fileTreeCopyPath') }}
              </el-dropdown-item>
              <el-dropdown-item command="rename">
                {{ t('common.terminal.fileTreeRename') }}
              </el-dropdown-item>
              <el-dropdown-item command="delete" class="terminal-file-tree__delete-item">
                {{ t('common.terminal.fileTreeDelete') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Folder } from '@element-plus/icons-vue'
import { useTerminalTranslate } from '@/core/terminal/TerminalI18n'
import type { SftpEntry, TerminalSessionDir } from '@/core/terminal/TerminalTypes'

const t = useTerminalTranslate()

const props = defineProps<{
  sessionId: string
  /** 根路径按会话语义解析：本机、WSL 与 SSH 均由主进程的统一通道处理 */
  rootPath: string
}>()

const emit = defineEmits<{
  'node-click': [entry: SftpEntry]
  loading: [loading: boolean]
  'root-resolved': [path: string]
  'load-error': [path: string, root: boolean, error?: unknown]
}>()

function onNodeCommand(command: string, entry: SftpEntry): void {
  if (command === 'rename') {
    void renameEntry(entry)
    return
  }
  if (command === 'delete') {
    void deleteEntry(entry)
    return
  }
  if (command === 'copy-path') {
    void copyPath(entry)
    return
  }
  if (command !== 'download') return
  void downloadEntry(entry)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 同目录下的新路径:按 entry.path 自身的分隔符风格拼接(本机可能是 '\',远端是 '/') */
function siblingPath(fullPath: string, name: string): string {
  const separator = fullPath.includes('\\') ? '\\' : '/'
  const index = fullPath.lastIndexOf(separator)
  if (index < 0) return name
  const directory = index === 0 ? separator : fullPath.slice(0, index)
  return `${directory}${directory.endsWith(separator) ? '' : separator}${name}`
}

async function downloadEntry(entry: SftpEntry): Promise<void> {
  const localPath = (await window.ipcRenderer.invoke('terminal-sftp-choose-download', {
    name: entry.name,
    directory: entry.directory,
  })) as string | null
  if (!localPath) return
  try {
    await window.ipcRenderer.invoke('terminal-session-download', {
      sessionId: props.sessionId,
      sessionPath: entry.path,
      localPath,
    })
    ElMessage.success(t('common.terminal.fileTreeDownloadDone', { name: entry.name }))
  } catch (error) {
    ElMessage.error(
      t('common.terminal.fileTreeDownloadFailed', {
        name: entry.name,
        message: errorMessage(error),
      }),
    )
  }
}

async function renameEntry(entry: SftpEntry): Promise<void> {
  try {
    const result = await ElMessageBox.prompt(
      t('common.terminal.fileTreeRenamePrompt', { name: entry.name }),
      t('common.terminal.fileTreeRename'),
      {
        inputValue: entry.name,
        inputValidator: (value: string) =>
          value.trim().length > 0 && !/[/\\]/.test(value)
            ? true
            : t('common.terminal.fileTreeRenameInvalidName'),
      },
    )
    const name = result.value.trim()
    if (name === entry.name) return
    await window.ipcRenderer.invoke('terminal-session-rename', {
      sessionId: props.sessionId,
      oldPath: entry.path,
      newPath: siblingPath(entry.path, name),
    })
    ElMessage.success(t('common.terminal.fileTreeRenameDone', { name }))
    if (expandedSet.delete(entry.path)) expandedSet.add(siblingPath(entry.path, name))
    expandedKeys.value = [...expandedSet]
    treeKey.value += 1
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(t('common.terminal.fileTreeOpFailed', { message: errorMessage(error) }))
  }
}

async function deleteEntry(entry: SftpEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(
      entry.directory
        ? t('common.terminal.fileTreeDeleteDirectoryConfirm', { name: entry.name })
        : t('common.terminal.fileTreeDeleteFileConfirm', { name: entry.name }),
      t('common.terminal.fileTreeDelete'),
      { type: 'warning' },
    )
    await window.ipcRenderer.invoke('terminal-session-delete', {
      sessionId: props.sessionId,
      path: entry.path,
      directory: entry.directory,
    })
    ElMessage.success(t('common.terminal.fileTreeDeleteDone', { name: entry.name }))
    treeKey.value += 1
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(t('common.terminal.fileTreeOpFailed', { message: errorMessage(error) }))
  }
}

type FileTreeNode = SftpEntry & { isLeaf: boolean }

interface LazyNode {
  level: number
  data?: FileTreeNode
}

const treeProps = { label: 'name', children: 'children', isLeaf: 'isLeaf' }
const treeKey = ref(0)
const truncatedEntryCount = ref<number | null>(null)
let pendingLoads = 0
// 展开状态跨刷新保持: 删除/重命名等操作触发重建时, 已展开目录自动恢复
const expandedKeys = ref<string[]>([])
const expandedSet = new Set<string>()

function rememberExpanded(data: SftpEntry): void {
  if (expandedSet.has(data.path)) return
  expandedSet.add(data.path)
  expandedKeys.value = [...expandedSet]
}

function forgetExpanded(data: SftpEntry): void {
  if (!expandedSet.delete(data.path)) return
  expandedKeys.value = [...expandedSet]
}

async function copyPath(entry: SftpEntry): Promise<void> {
  try {
    await navigator.clipboard.writeText(entry.path)
    ElMessage.success(t('common.terminal.fileTreeCopyPathDone', { path: entry.path }))
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function listDirectory(path: string, root: boolean): Promise<TerminalSessionDir | null> {
  pendingLoads += 1
  emit('loading', true)
  try {
    const result = (await window.ipcRenderer.invoke('terminal-session-list-dir', {
      sessionId: props.sessionId,
      path,
    })) as TerminalSessionDir | null
    if (!result) emit('load-error', path, root)
    if (result?.truncated && truncatedEntryCount.value === null) {
      truncatedEntryCount.value = result.entries.length
    }
    return result
  } catch (error) {
    emit('load-error', path, root, error)
    return null
  } finally {
    pendingLoads -= 1
    if (pendingLoads === 0) emit('loading', false)
  }
}

async function loadNode(node: LazyNode, resolve: (data: FileTreeNode[]) => void): Promise<void> {
  const root = node.level === 0
  const path = root ? props.rootPath : node.data?.path
  const dir = path ? await listDirectory(path, root) : null
  if (root && dir) emit('root-resolved', dir.resolvedPath)
  resolve(toNodes(dir?.entries ?? []))
}

function toNodes(entries: SftpEntry[]): FileTreeNode[] {
  return entries.map((entry) => ({ ...entry, isLeaf: !entry.directory }))
}

watch(
  () => [props.sessionId, props.rootPath],
  () => {
    truncatedEntryCount.value = null
    expandedSet.clear()
    expandedKeys.value = []
    treeKey.value += 1
  },
)
</script>

<style scoped>
.terminal-file-tree {
  min-height: 0;
  overflow: auto;
}
.terminal-file-tree__truncated {
  position: sticky;
  z-index: 1;
  top: 0;
  padding: 4px 8px;
  color: var(--el-color-warning);
  background: var(--app-surface);
  font-size: 11px;
}
.terminal-file-tree__node {
  display: inline-flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  /* el-tree 行高固定，行内盒要给字母下延（g/p/y）留出空间，否则被 overflow 裁掉 */
  line-height: 1.5;
}

.terminal-file-tree__icon {
  margin-right: 4px;
  color: var(--app-text-muted);
  vertical-align: -2px;
}
.terminal-file-tree__name {
  overflow: hidden;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.terminal-file-tree__delete-item {
  color: var(--el-color-error);
}
</style>
