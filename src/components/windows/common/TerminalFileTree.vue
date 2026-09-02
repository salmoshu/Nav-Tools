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
      @node-click="emit('node-click', $event)"
    >
      <template #default="{ data }">
        <el-icon class="terminal-file-tree__icon">
          <Folder v-if="data.directory" />
          <Document v-else />
        </el-icon>
        <span class="terminal-file-tree__name">{{ data.name }}</span>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
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

type FileTreeNode = SftpEntry & { isLeaf: boolean }

interface LazyNode {
  level: number
  data?: FileTreeNode
}

const treeProps = { label: 'name', children: 'children', isLeaf: 'isLeaf' }
const treeKey = ref(0)
const truncatedEntryCount = ref<number | null>(null)
let pendingLoads = 0

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
.terminal-file-tree__icon {
  margin-right: 4px;
  color: var(--app-text-muted);
  vertical-align: -2px;
}
.terminal-file-tree__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
