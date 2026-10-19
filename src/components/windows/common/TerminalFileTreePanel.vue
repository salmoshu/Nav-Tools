<template>
  <aside
    ref="panelElement"
    class="file-tree-panel"
    :style="{ width: `${panelWidth}px` }"
  >
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
      @download-start="handleDownloadStart"
      @download-settle="handleDownloadSettle"
    />

    <footer class="file-tree-status" :class="`file-tree-status--${download.phase}`" role="status">
      <svg
        v-if="download.phase !== 'idle'"
        class="file-tree-status__ring"
        :class="{ 'file-tree-status__ring--indeterminate': ringIndeterminate }"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <circle class="file-tree-status__ring-track" cx="8" cy="8" :r="FILE_TREE_RING_RADIUS" />
        <circle
          class="file-tree-status__ring-arc"
          cx="8"
          cy="8"
          :r="FILE_TREE_RING_RADIUS"
          :stroke-dasharray="ringDasharray"
        />
      </svg>
      <span class="file-tree-status__text" :title="download.error || download.name || undefined">{{
        statusText
      }}</span>
      <span v-if="transferDetail" class="file-tree-status__detail">{{ transferDetail }}</span>
    </footer>
    <div
      ref="resizeHandle"
      class="file-tree-resizer"
      :class="{ dragging: resizing }"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-valuenow="panelWidth"
      :aria-valuemin="MIN_FILE_TREE_WIDTH"
      :aria-valuemax="MAX_FILE_TREE_WIDTH"
      :aria-label="t('common.terminal.resizeFileTreePanel')"
      @pointerdown="startResize"
      @pointermove="resizeWithPointer"
      @pointerup="finishResize"
      @pointercancel="finishResize"
      @lostpointercapture="finishResize"
      @keydown="resizeWithKeyboard"
    ></div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Position, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useTerminalTranslate } from '@/core/terminal/TerminalI18n'
import { buildShellCdCommand, shellFamilyFor } from '@/core/terminal/ShellQuote'
import { parentPathOf } from '@/core/terminal/TerminalTypes'
import type {
  LocalShellKind,
  SftpEntry,
  SftpTransferEvent,
  TerminalSessionKind,
} from '@/core/terminal/TerminalTypes'
import {
  FILE_TREE_RING_RADIUS,
  IDLE_FILE_TREE_DOWNLOAD,
  beginFileTreeDownload,
  fileTreeDownloadPercent,
  fileTreeRingDasharray,
  fileTreeRingIndeterminateDasharray,
  formatRemainingSeconds,
  formatTransferBytes,
  formatTransferPair,
  formatTransferPairText,
  pushTransferSample,
  reduceFileTreeTransferEvent,
  remainingTransferSeconds,
  settleFileTreeDownload,
  windowTransferRate,
  type FileTreeDownloadStatus,
  type TransferProgressSample,
} from '@/core/terminal/FileTreeDownloadStatus'
import TerminalFileTree from './TerminalFileTree.vue'

const t = useTerminalTranslate()

const props = defineProps<{
  sessionId: string
  /** 决定路径语义与 shell 家族;本机会话要看 localShell 才能选对转义规则 */
  kind: TerminalSessionKind
  localShell?: LocalShellKind
  /** system 本地 shell 需按宿主平台区分 PowerShell 与 POSIX */
  platform: string
  /**
   * 预览 tab 激活/打开文件时跟随的目录(被预览文件所在目录);
   * undefined 表示普通 tab,面板保持用户当前浏览位置
   */
  revealPath?: string
}>()

const emit = defineEmits<{
  /** 点击文件:交给上层开预览 Tab,面板自身不再内嵌预览区 */
  'open-file': [entry: SftpEntry]
}>()

const pathInput = ref('.')
/** 根路径;`'.'` 交给主进程按会话运行时 cwd 解析 */
const rootPath = ref('.')
const resolvedRoot = ref('.')
const loading = ref(false)
/** 变更即重挂载 el-tree:懒加载树的根节点只在挂载时拉一次 */
const treeKey = ref(0)
const currentNode = ref<SftpEntry | null>(null)
const openTarget = computed(() => {
  const node = currentNode.value
  if (!node) return resolvedRoot.value
  return node.directory ? node.path : parentPathOf(node.path)
})

const MIN_FILE_TREE_WIDTH = 220
const MAX_FILE_TREE_WIDTH = 560
const DEFAULT_FILE_TREE_WIDTH = 300
const panelElement = ref<HTMLElement | null>(null)
const resizeHandle = ref<HTMLElement | null>(null)
const panelWidth = ref(DEFAULT_FILE_TREE_WIDTH)
const resizing = ref(false)
let activePointerId: number | null = null

function panelWidthBounds(): { min: number; max: number } {
  const containerWidth = panelElement.value?.parentElement?.getBoundingClientRect().width || 0
  if (!containerWidth) return { min: MIN_FILE_TREE_WIDTH, max: MAX_FILE_TREE_WIDTH }
  const max = Math.min(
    MAX_FILE_TREE_WIDTH,
    Math.max(MIN_FILE_TREE_WIDTH, Math.floor(containerWidth * 0.7)),
  )
  return { min: MIN_FILE_TREE_WIDTH, max }
}

function clampPanelWidth(width: number): number {
  const { min, max } = panelWidthBounds()
  return Math.round(Math.min(max, Math.max(min, width)))
}

function startResize(event: PointerEvent): void {
  if (event.button !== 0) return
  event.preventDefault()
  activePointerId = event.pointerId
  resizing.value = true
  resizeHandle.value?.setPointerCapture(event.pointerId)
  resizeWithPointer(event)
}

function resizeWithPointer(event: PointerEvent): void {
  if (!resizing.value || event.pointerId !== activePointerId) return
  const panelRect = panelElement.value?.getBoundingClientRect()
  if (!panelRect) return
  panelWidth.value = clampPanelWidth(event.clientX - panelRect.left)
}

function finishResize(event: PointerEvent): void {
  if (activePointerId !== null && event.pointerId !== activePointerId) return
  const handle = resizeHandle.value
  if (handle?.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
  activePointerId = null
  resizing.value = false
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const delta = event.shiftKey ? 40 : 12
  panelWidth.value = clampPanelWidth(panelWidth.value + (event.key === 'ArrowRight' ? delta : -delta))
}

const download = ref<FileTreeDownloadStatus>(IDLE_FILE_TREE_DOWNLOAD)
const downloadPercent = computed(() => fileTreeDownloadPercent(download.value))
/** 进度环弧长:success 恒为满环;error 冻结在失败时的百分比(总量未知则满环) */
const ringArcPercent = computed(() =>
  download.value.phase === 'success' ? 100 : downloadPercent.value,
)
/** 不定态只在 running 且总量未知(WSL tar 流式)时开启;终态冻结成满环着色 */
const ringIndeterminate = computed(
  () => download.value.phase === 'running' && downloadPercent.value === null,
)
const ringDasharray = computed(
  () => fileTreeRingDasharray(ringArcPercent.value) ?? fileTreeRingIndeterminateDasharray(),
)
/** 滑动窗口(>=1s)估算的速率(字节/秒);非 running 或新任务时归零 */
const transferRate = ref<number | null>(null)
/** 最近一段窗口内的 running 采样队列;download-start/终态/会话切换时清空 */
let transferSamples: TransferProgressSample[] = []

/** 状态栏聚合详情:`12.3/100.0 MB · 300.0 KB/s · 预计剩余 01:05`(同单位定宽,避免跳变) */
const transferDetail = computed(() => {
  const status = download.value
  if (status.phase !== 'running') return ''
  const pair = formatTransferPair(status.transferred, status.total)
  const bytes = pair ? formatTransferPairText(pair) : formatTransferBytes(status.transferred)
  const parts = [bytes]
  const rate = transferRate.value
  if (rate && rate > 0) {
    parts.push(`${formatTransferBytes(rate)}/s`)
    const remaining = remainingTransferSeconds(status.transferred, status.total, rate)
    if (remaining !== null) {
      parts.push(t('common.terminal.fileTreeTransferEta', { time: formatRemainingSeconds(remaining) }))
    }
  }
  return parts.join(' · ')
})
const statusText = computed(() => {
  switch (download.value.phase) {
    case 'running':
      return t('common.terminal.fileTreeStatusDownloading', { name: download.value.name })
    case 'success':
      return t('common.terminal.fileTreeStatusDone', { name: download.value.name })
    case 'error':
      return t('common.terminal.fileTreeStatusFailed', { name: download.value.name })
    default:
      return t('common.terminal.fileTreeStatusIdle')
  }
})

function handleDownloadStart(name: string): void {
  transferSamples = []
  transferRate.value = null
  download.value = beginFileTreeDownload(name)
}

function handleDownloadSettle(ok: boolean, error?: string): void {
  transferSamples = []
  transferRate.value = null
  download.value = settleFileTreeDownload(download.value, ok, error)
}

function handleTransfer(_event: unknown, event: SftpTransferEvent): void {
  if (event.sessionId !== props.sessionId) return
  const next = reduceFileTreeTransferEvent(download.value, event)
  if (event.status === 'running') {
    transferSamples = pushTransferSample(transferSamples, {
      at: Date.now(),
      transferred: next.transferred,
      total: next.total,
    })
    transferRate.value = windowTransferRate(transferSamples)
  } else {
    transferSamples = []
    transferRate.value = null
  }
  download.value = next
}

onMounted(() => window.ipcRenderer?.on('terminal-sftp-transfer', handleTransfer))
onUnmounted(() => window.ipcRenderer?.off('terminal-sftp-transfer', handleTransfer))

function handleNodeClick(data: SftpEntry): void {
  currentNode.value = data
  if (data.directory) return
  emit('open-file', data)
}

function handleTreeLoadError(_path: string, _root: boolean, error?: unknown): void {
  ElMessage.error(error ? errorMessage(error) : t('common.terminal.fileTreeLoadFailed'))
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
  currentNode.value = null
  treeKey.value += 1
}

function reload(): void {
  pathInput.value = rootPath.value
  loading.value = false
  treeKey.value += 1
}

/** 导航到指定根目录并重挂载树(懒加载树的根节点只在挂载时拉一次) */
function navigateToRoot(path: string): void {
  rootPath.value = path
  pathInput.value = path
  resolvedRoot.value = path
  loading.value = false
  currentNode.value = null
  treeKey.value += 1
}

watch(
  [() => props.sessionId, () => props.revealPath],
  ([sessionId, reveal], [prevSessionId, prevReveal]) => {
    if (sessionId !== prevSessionId) {
      // 会话切换:落在 reveal 目录(若有)否则默认根;下载状态随旧会话失效
      transferSamples = []
      transferRate.value = null
      download.value = IDLE_FILE_TREE_DOWNLOAD
      navigateToRoot(reveal || '.')
      return
    }
    // 同会话内激活/打开预览:跟随到文件所在目录;已在该目录则不动,避免重挂载打断浏览
    if (reveal && reveal !== prevReveal && reveal !== rootPath.value) navigateToRoot(reveal)
    // reveal 变回 undefined(切回普通 tab):保持当前位置,不打扰
  },
  { immediate: true },
)


function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
</script>

<style scoped>
.file-tree-panel {
  position: relative;
  min-width: 220px;
  max-width: min(560px, 70%);
  display: flex;
  flex: none;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--app-border);
  background: var(--app-surface);
}
.file-tree-resizer {
  position: absolute;
  z-index: 3;
  top: 0;
  right: 0;
  bottom: 0;
  width: 9px;
  outline: none;
  cursor: col-resize;
  touch-action: none;
}
.file-tree-resizer::after {
  position: absolute;
  top: 0;
  right: 3px;
  bottom: 0;
  width: 2px;
  border-radius: 2px;
  background: transparent;
  content: '';
  transition:
    background 0.12s ease,
    box-shadow 0.12s ease;
}
.file-tree-resizer:hover::after,
.file-tree-resizer:focus-visible::after,
.file-tree-resizer.dragging::after {
  background: var(--el-color-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-primary) 18%, transparent);
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
.file-tree-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  color: var(--app-text-muted);
  font-size: 11px;
  border-top: 1px solid var(--app-border);
}
.file-tree-status__ring {
  width: 14px;
  height: 14px;
  flex: none;
}
.file-tree-status__ring circle {
  fill: none;
  stroke-width: 2;
}
.file-tree-status__ring-track {
  stroke: color-mix(in srgb, var(--app-text-muted) 28%, transparent);
}
.file-tree-status__ring-arc {
  stroke: var(--el-color-primary);
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: center;
  transition: stroke-dasharray 0.2s ease;
}
/* 终态环形配色跟随相位:成功绿/失败红 */
.file-tree-status--success .file-tree-status__ring-arc {
  stroke: var(--el-color-success);
}
.file-tree-status--error .file-tree-status__ring-arc {
  stroke: var(--el-color-error);
}
.file-tree-status__ring--indeterminate {
  animation: file-tree-ring-spin 0.9s linear infinite;
}
.file-tree-status__ring--indeterminate .file-tree-status__ring-arc {
  transition: none;
}
@keyframes file-tree-ring-spin {
  to {
    transform: rotate(360deg);
  }
}
.file-tree-status__text {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tree-status--error .file-tree-status__text {
  color: var(--el-color-error);
}
.file-tree-status__detail {
  flex: none;
  min-width: 24ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
