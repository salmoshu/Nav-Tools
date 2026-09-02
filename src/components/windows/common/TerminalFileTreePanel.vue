<template>
  <aside class="file-tree-panel">
    <div class="file-tree-toolbar">
      <el-input
        v-model="pathInput"
        size="small"
        :placeholder="t('common.terminal.fileTreeRootHint')"
        @keyup.enter="applyRoot"
      />
      <el-tooltip :content="t('common.terminal.refresh')" placement="bottom">
        <el-button text size="small" :loading="loading" @click="reload">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="t('common.terminal.fileTreeOpenInTerminal')" placement="bottom">
        <el-button text size="small" :disabled="!openTarget" @click="openInTerminal">
          <el-icon><Position /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
    <div class="file-tree-root" :title="resolvedRoot">{{ resolvedRoot }}</div>

    <TerminalFileTree
      :key="treeKey"
      class="file-tree"
      :session-id="sessionId"
      :root-path="rootPath"
      @loading="loading = $event"
      @root-resolved="resolvedRoot = $event"
      @load-error="handleTreeLoadError"
      @node-click="handleNodeClick"
    />

    <div v-if="preview" class="file-tree-preview">
      <header class="file-tree-preview__bar">
        <span class="file-tree-preview__name" :title="preview.path">{{ preview.path }}</span>
        <el-button text size="small" @click="preview = null">
          <el-icon><Close /></el-icon>
        </el-button>
      </header>
      <div class="file-tree-preview__body">
        <span v-if="preview.status === 'loading'">{{
          t('common.terminal.guiPreviewLoading')
        }}</span>
        <span v-else-if="preview.status === 'unavailable'">{{
          t('common.terminal.guiPreviewUnavailable')
        }}</span>
        <template v-else>
          <TerminalRichContent :payload="preview.payload" />
          <span v-if="preview.truncated" class="file-tree-preview__note">{{
            t('common.terminal.guiPreviewTruncated')
          }}</span>
        </template>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Close, Position, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { TerminalRichPayload } from '@/core/terminal/CommandBlocks'
import { useTerminalTranslate } from '@/core/terminal/TerminalI18n'
import { buildShellCdCommand, shellFamilyFor } from '@/core/terminal/ShellQuote'
import type { LocalShellKind, SftpEntry, TerminalSessionKind } from '@/core/terminal/TerminalTypes'
import TerminalFileTree from './TerminalFileTree.vue'
import TerminalRichContent from './TerminalRichContent.vue'

const t = useTerminalTranslate()

const props = defineProps<{
  sessionId: string
  /** 决定路径语义与 shell 家族;本机会话要看 localShell 才能选对转义规则 */
  kind: TerminalSessionKind
  localShell?: LocalShellKind
  /** system 本地 shell 需按宿主平台区分 PowerShell 与 POSIX */
  platform: string
}>()

/** 预览读文件上限,与 GUI 视图的块内预览一致 */
const PREVIEW_MAX_BYTES = 512 * 1024

type PreviewState =
  | { status: 'loading'; path: string }
  | { status: 'ready'; path: string; payload: TerminalRichPayload; truncated: boolean }
  | { status: 'unavailable'; path: string }

const pathInput = ref('.')
/** 根路径;`'.'` 交给主进程按会话运行时 cwd 解析 */
const rootPath = ref('.')
const resolvedRoot = ref('.')
const loading = ref(false)
const preview = ref<PreviewState | null>(null)
/** 变更即重挂载 el-tree:懒加载树的根节点只在挂载时拉一次 */
const treeKey = ref(0)
const currentNode = ref<SftpEntry | null>(null)
const openTarget = computed(() => {
  const node = currentNode.value
  if (!node) return resolvedRoot.value
  return node.directory ? node.path : parentOf(node.path)
})

function handleNodeClick(data: SftpEntry): void {
  currentNode.value = data
  if (data.directory) {
    preview.value = null
    return
  }
  void showPreview(data.path)
}

function handleTreeLoadError(_path: string, _root: boolean, error?: unknown): void {
  ElMessage.error(error ? errorMessage(error) : t('common.terminal.fileTreeLoadFailed'))
}

async function showPreview(path: string): Promise<void> {
  preview.value = { status: 'loading', path }
  try {
    const read = (await window.ipcRenderer.invoke('terminal-path-read', {
      sessionId: props.sessionId,
      path,
      maxBytes: PREVIEW_MAX_BYTES,
    })) as { mime: string; data: string; size: number; truncated: boolean } | null
    preview.value = read
      ? {
          status: 'ready',
          path,
          payload: { mime: read.mime, data: read.data },
          truncated: read.truncated,
        }
      : { status: 'unavailable', path }
  } catch {
    preview.value = { status: 'unavailable', path }
  }
}

/**
 * 把目录写进会话输入。路径来自文件系统(可能含空格/引号),必须按 shell 家族
 * 转义——`buildShellCdCommand` 负责这一步,这里只负责拼回车。
 */
async function openInTerminal(): Promise<void> {
  const target = openTarget.value
  if (!target) return
  const command = buildShellCdCommand(
    target,
    shellFamilyFor(props.kind, props.localShell, props.platform),
  )
  try {
    await window.ipcRenderer.invoke('terminal-session-write', {
      sessionId: props.sessionId,
      data: `${command}\r`,
    })
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function applyRoot(): void {
  rootPath.value = pathInput.value.trim() || '.'
  resolvedRoot.value = rootPath.value
  loading.value = false
  preview.value = null
  currentNode.value = null
  treeKey.value += 1
}

function reload(): void {
  pathInput.value = rootPath.value
  loading.value = false
  preview.value = null
  treeKey.value += 1
}

watch(
  () => props.sessionId,
  () => {
    rootPath.value = '.'
    pathInput.value = '.'
    resolvedRoot.value = '.'
    loading.value = false
    preview.value = null
    currentNode.value = null
    treeKey.value += 1
  },
)

/** 取父目录:`C:` / `/` 这类盘符与根要保留分隔符,否则 cd 不认 */
function parentOf(value: string): string {
  const index = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
  if (index <= 0) return value.slice(0, 1) || value
  const parent = value.slice(0, index)
  return /^[A-Za-z]:$/.test(parent) ? value.slice(0, index + 1) : parent
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
</script>

<style scoped>
.file-tree-panel {
  position: relative;
  width: 300px;
  min-width: 220px;
  max-width: min(560px, 70%);
  display: flex;
  flex: none;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--app-border);
  background: var(--app-surface);
  resize: horizontal;
}
.file-tree-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 2px;
  align-items: center;
  padding: 6px;
  border-bottom: 1px solid var(--app-border);
}
.file-tree-root {
  overflow: hidden;
  padding: 3px 8px;
  color: var(--app-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-bottom: 1px solid var(--app-border);
}
.file-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.file-tree-preview {
  display: flex;
  max-height: 45%;
  flex: none;
  flex-direction: column;
  border-top: 1px solid var(--app-border);
}
.file-tree-preview__bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
}
.file-tree-preview__name {
  overflow: hidden;
  flex: 1;
  color: var(--app-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tree-preview__body {
  min-height: 0;
  overflow: auto;
  padding: 0 8px 8px;
  font-size: 12px;
}
.file-tree-preview__note {
  display: block;
  color: var(--app-text-muted);
  font-size: 10px;
}
</style>
