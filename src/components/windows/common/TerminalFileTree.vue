<template>
  <div class="terminal-file-tree">
    <div v-if="truncatedEntryCount !== null" class="terminal-file-tree__truncated" role="status">
      {{ t('common.terminal.fileTreeTruncated', { count: truncatedEntryCount }) }}
    </div>
    <el-tree
      :key="treeKey"
      class="terminal-file-tree__tree"
      :class="{ 'terminal-file-tree__tree--dragging': treeDragging }"
      :props="treeProps"
      :load="loadNode"
      node-key="path"
      lazy
      draggable
      :allow-drop="allowTreeDrop"
      highlight-current
      :default-expanded-keys="expandedKeys"
      @node-expand="rememberExpanded"
      @node-collapse="forgetExpanded"
      @node-click="emit('node-click', $event)"
      @node-drag-start="onNodeDragStart"
      @node-drop="onNodeDrop"
      @node-drag-end="onNodeDragEnd"
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
import { onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Folder } from '@element-plus/icons-vue'
import {
  FILE_TREE_DRAG_MIME,
  beginFileTreeDrag,
  canDropFileTreeNode,
  endFileTreeDrag,
  isNoopFileTreeMove,
  isOutsideWindow,
  joinFileTreePath,
  markFileTreeDragHandled,
  type FileTreeDragPayload,
  type FileTreeDropPosition,
} from '@/core/terminal/FileTreeDrag'
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
  'download-start': [name: string]
  'download-settle': [ok: boolean, error?: string]
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
  emit('download-start', entry.name)
  try {
    await window.ipcRenderer.invoke('terminal-session-download', {
      sessionId: props.sessionId,
      sessionPath: entry.path,
      localPath,
    })
    emit('download-settle', true)
    ElMessage.success(t('common.terminal.fileTreeDownloadDone', { name: entry.name }))
  } catch (error) {
    emit('download-settle', false, errorMessage(error))
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

/** el-tree 拖拽回调里的节点形状:只需要 data 载荷 */
interface TreeDragNode {
  data: FileTreeNode
}

/** 拖拽进行中:给树加拖拽态类名,目标目录的品牌蓝高亮见样式表的 is-drop-inner 规则 */
const treeDragging = ref(false)

/** 只允许 inner 落入目录,禁止落入自身/子孙(规则纯函数在 FileTreeDrag.ts) */
function allowTreeDrop(
  draggingNode: TreeDragNode,
  dropNode: TreeDragNode,
  position: FileTreeDropPosition,
): boolean {
  return canDropFileTreeNode(draggingNode.data, dropNode.data, position)
}

function onNodeDrop(draggingNode: TreeDragNode, dropNode: TreeDragNode, dropType: string): void {
  markFileTreeDragHandled()
  if (dropType !== 'inner') return
  void moveEntry(draggingNode.data, dropNode.data)
}

/** 拖入目录 = 远端移动:复用三通道 rename IPC(SSH SFTP / 本机 fs.rename / WSL mv) */
async function moveEntry(source: SftpEntry, targetDir: SftpEntry): Promise<void> {
  const newPath = joinFileTreePath(targetDir.path, source.name)
  // el-tree 在 drop 时已改过客户端树模型,无论成败都重建回服务端真实状态
  try {
    if (isNoopFileTreeMove(source.path, source.name, targetDir.path)) return
    // 覆盖检查:目标目录已有同名条目时先确认;确认后先删再移,三通道语义统一
    const existing = (await window.ipcRenderer.invoke('terminal-path-stat', {
      sessionId: props.sessionId,
      path: newPath,
    })) as { exists: boolean; directory: boolean } | null
    if (existing?.exists) {
      await ElMessageBox.confirm(
        t('common.terminal.fileTreeMoveOverwriteConfirm', { name: source.name }),
        t('common.terminal.fileTreeMove'),
        { type: 'warning' },
      )
      await window.ipcRenderer.invoke('terminal-session-delete', {
        sessionId: props.sessionId,
        path: newPath,
        directory: existing.directory,
      })
    }
    await window.ipcRenderer.invoke('terminal-session-rename', {
      sessionId: props.sessionId,
      oldPath: source.path,
      newPath,
    })
    ElMessage.success(t('common.terminal.fileTreeMoveDone', { name: source.name }))
    // 源子树的展开键整体改前缀到移动后路径;目标目录加入展开集,让用户看到落点
    remapExpandedPrefix(source.path, newPath)
    expandedSet.add(targetDir.path)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(t('common.terminal.fileTreeOpFailed', { message: errorMessage(error) }))
    }
  } finally {
    expandedKeys.value = [...expandedSet]
    treeKey.value += 1
  }
}

/** 把 expandedSet 里 oldPrefix 自身/子孙的键整体改到 newPrefix 下 */
function remapExpandedPrefix(oldPrefix: string, newPrefix: string): void {
  const separator = oldPrefix.includes('\\') ? '\\' : '/'
  for (const key of [...expandedSet]) {
    if (key !== oldPrefix && !key.startsWith(oldPrefix + separator)) continue
    expandedSet.delete(key)
    expandedSet.add(newPrefix + key.slice(oldPrefix.length))
  }
}

/** 拖出应用的临时缓存:远端路径 → 已就绪的本地临时文件 */
const dragOutCache = new Map<string, string>()
/** 正在下载到临时缓存的路径(防重入) */
const dragOutPreparing = new Set<string>()
/** 上次拖出未遂后武装的路径:下一次 dragstart 直接由主进程 startDrag 原生拖出 */
let armedDragOutPath: string | null = null
let armedTimer: ReturnType<typeof setTimeout> | undefined
/** 武装有效期:超时后该条目下一次拖拽恢复为普通应用内拖拽 */
const DRAG_OUT_ARM_MS = 60_000

function onNodeDragStart(node: TreeDragNode, event: DragEvent): void {
  const entry = node.data
  const cached = dragOutCache.get(entry.path)
  // 上次拖出未遂后再次拖拽:取消 HTML5 拖拽,改由主进程 startDrag 发起系统级拖拽
  // (startDrag 依赖当前鼠标按住状态,dragstart 时机必然满足)
  if (armedDragOutPath === entry.path && cached) {
    disarmDragOut()
    event.preventDefault()
    window.ipcRenderer.send('terminal-file-tree-start-drag', { path: cached })
    return
  }
  disarmDragOut()
  treeDragging.value = true
  const payload: FileTreeDragPayload = {
    sessionId: props.sessionId,
    path: entry.path,
    name: entry.name,
    directory: entry.directory,
  }
  beginFileTreeDrag(payload)
  if (event.dataTransfer) {
    // 树内落点是移动、拖到终端窗格是插入(copy),两种 dropEffect 都放行
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData(FILE_TREE_DRAG_MIME, JSON.stringify(payload))
  }
}

function onNodeDragEnd(
  _draggingNode: TreeDragNode,
  _dropNode: TreeDragNode | null,
  _dropType: string,
  event: DragEvent,
): void {
  treeDragging.value = false
  const gesture = endFileTreeDrag()
  if (!gesture || gesture.handledInApp) return
  // 窗口内无效落点(不允许的节点等)不触发;dragend 坐标越出窗口才算拖出应用
  if (!isOutsideWindow(event.clientX, event.clientY, window.innerWidth, window.innerHeight)) return
  void handleDragOut(gesture.payload)
}

/** 拖出应用:远端文件先下载到系统临时目录(状态栏有进度),就绪后武装并提示再拖一次 */
async function handleDragOut(payload: FileTreeDragPayload): Promise<void> {
  if (dragOutCache.has(payload.path)) {
    armDragOut(payload.path)
    ElMessage.success(t('common.terminal.fileTreeDragOutReady', { name: payload.name }))
    return
  }
  if (dragOutPreparing.has(payload.path)) return
  dragOutPreparing.add(payload.path)
  emit('download-start', payload.name)
  try {
    const localPath = (await window.ipcRenderer.invoke('terminal-file-tree-drag-temp-path', {
      sessionId: payload.sessionId,
      name: payload.name,
    })) as string
    await window.ipcRenderer.invoke('terminal-session-download', {
      sessionId: payload.sessionId,
      sessionPath: payload.path,
      localPath,
    })
    dragOutCache.set(payload.path, localPath)
    emit('download-settle', true)
    armDragOut(payload.path)
    ElMessage.success(t('common.terminal.fileTreeDragOutReady', { name: payload.name }))
  } catch (error) {
    emit('download-settle', false, errorMessage(error))
    ElMessage.error(t('common.terminal.fileTreeOpFailed', { message: errorMessage(error) }))
  } finally {
    dragOutPreparing.delete(payload.path)
  }
}

function armDragOut(path: string): void {
  armedDragOutPath = path
  if (armedTimer) clearTimeout(armedTimer)
  armedTimer = setTimeout(() => {
    armedDragOutPath = null
    armedTimer = undefined
  }, DRAG_OUT_ARM_MS)
}

function disarmDragOut(): void {
  armedDragOutPath = null
  if (armedTimer) {
    clearTimeout(armedTimer)
    armedTimer = undefined
  }
}

onBeforeUnmount(() => disarmDragOut())

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
/* 拖拽态:品牌蓝高亮可落入的目标目录(el-tree 给 inner 目标节点加 is-drop-inner) */
.terminal-file-tree__tree--dragging :deep(.el-tree-node__content) {
  transition: background 0.12s ease;
}
.terminal-file-tree :deep(.el-tree-node.is-drop-inner) > .el-tree-node__content {
  background: color-mix(in srgb, var(--el-color-primary) 16%, transparent);
  box-shadow: inset 0 0 0 1px var(--el-color-primary);
  border-radius: 6px;
}
</style>
