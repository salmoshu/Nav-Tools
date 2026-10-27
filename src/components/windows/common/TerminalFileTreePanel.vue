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
      ref="fileTreeRef"
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

    <footer class="file-tree-status" :class="`file-tree-status--${aggregate.phase}`" role="status">
      <div class="file-tree-status__line">
        <span class="file-tree-status__text" :title="aggregate.error || aggregate.name || undefined">{{
          statusText
        }}</span>
        <span
          v-if="aggregate.phase === 'running' && totalDownloadPercent !== null"
          class="file-tree-status__percent"
          >{{ totalDownloadPercent }}%</span
        >
      </div>
      <span v-if="transferDetail" class="file-tree-status__detail">{{ transferDetail }}</span>
      <div
        v-if="aggregate.phase === 'running'"
        class="file-tree-status__progress"
        :class="{
          'file-tree-status__progress--indeterminate': totalDownloadPercent === null,
        }"
        role="progressbar"
        :aria-label="t('common.terminal.fileTreeTotalProgress')"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="totalDownloadPercent ?? undefined"
      >
        <span class="file-tree-status__progress-fill" :style="progressFillStyle"></span>
      </div>
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
  EMPTY_FILE_TREE_DOWNLOAD_QUEUE,
  aggregateFileTreeDownloads,
  fileTreeQueuePercent,
  formatRemainingSeconds,
  formatTransferBytes,
  formatTransferPair,
  formatTransferPairText,
  pushTransferSample,
  queueFileTreeDownload,
  reduceFileTreeTransferEvent,
  remainingTransferSeconds,
  settleFileTreeDownload,
  windowTransferRate,
  type FileTreeDownloadQueue,
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
const DEFAULT_FILE_TREE_WIDTH = 240
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

/** 下载队列:并发任务各占一条;状态栏只渲染聚合视图,单任务终态不再切换整条栏 */
const download = ref<FileTreeDownloadQueue>(EMPTY_FILE_TREE_DOWNLOAD_QUEUE)
const aggregate = computed(() => aggregateFileTreeDownloads(download.value))
const totalDownloadPercent = computed(() => {
  const agg = aggregate.value
  if (agg.phase !== 'running' || agg.hasUnknownTotal) return null
  return fileTreeQueuePercent(agg)
})
const progressFillStyle = computed(() =>
  totalDownloadPercent.value === null
    ? {}
    : { transform: `scaleX(${totalDownloadPercent.value / 100})` },
)
/** 滑动窗口(>=1s)估算的速率(字节/秒);无 running 任务或队列复位时归零 */
const transferRate = ref<number | null>(null)
/** 最近一段窗口内的 running 采样队列;队列清空/会话切换时清空 */
let transferSamples: TransferProgressSample[] = []

/** 聚合终态的停留时长:队列清空后展示结果再收起;衔接中的下一个下载直接接管,不闪烁 */
const TERMINAL_STATUS_LINGER_MS = 1600
let lingerTimer: ReturnType<typeof setTimeout> | undefined

function clearLingerTimer(): void {
  if (lingerTimer) {
    clearTimeout(lingerTimer)
    lingerTimer = undefined
  }
}

watch(
  () => aggregate.value.phase,
  (phase) => {
    if (phase === 'success' || phase === 'error') {
      clearLingerTimer()
      lingerTimer = setTimeout(() => {
        lingerTimer = undefined
        download.value = EMPTY_FILE_TREE_DOWNLOAD_QUEUE
        transferSamples = []
        transferRate.value = null
      }, TERMINAL_STATUS_LINGER_MS)
      return
    }
    clearLingerTimer()
  },
)

/** 状态栏聚合详情:`12.3/100.0 MB · 300.0 KB/s · 预计剩余 01:05`(同单位定宽,避免跳变) */
const transferDetail = computed(() => {
  const agg = aggregate.value
  if (agg.phase !== 'running') return ''
  const pair =
    agg.total > 0 && !agg.hasUnknownTotal
      ? formatTransferPair(agg.knownTransferred, agg.total)
      : null
  const bytes = pair ? formatTransferPairText(pair) : formatTransferBytes(agg.transferred)
  const parts = [bytes]
  const rate = transferRate.value
  if (rate && rate > 0) {
    parts.push(`${formatTransferBytes(rate)}/s`)
    // 存在总量未知的任务时已知分母不代表全局,不展示预计剩余
    if (!agg.hasUnknownTotal) {
      const remaining = remainingTransferSeconds(agg.knownTransferred, agg.total, rate)
      if (remaining !== null) {
        parts.push(
          t('common.terminal.fileTreeTransferEta', { time: formatRemainingSeconds(remaining) }),
        )
      }
    }
  }
  return parts.join(' · ')
})
const statusText = computed(() => {
  const agg = aggregate.value
  switch (agg.phase) {
    case 'running':
      return agg.runningCount > 1
        ? t('common.terminal.fileTreeStatusDownloadingMany', { count: agg.runningCount })
        : t('common.terminal.fileTreeStatusDownloading', { name: agg.name })
    case 'success':
      return agg.successCount > 1
        ? t('common.terminal.fileTreeStatusDoneMany', { count: agg.successCount })
        : t('common.terminal.fileTreeStatusDone', { name: agg.name })
    case 'error':
      if (agg.successCount > 0) {
        return t('common.terminal.fileTreeStatusPartial', {
          done: agg.successCount,
          failed: agg.failedCount,
        })
      }
      return agg.failedCount > 1
        ? t('common.terminal.fileTreeStatusFailedMany', { count: agg.failedCount })
        : t('common.terminal.fileTreeStatusFailed', { name: agg.name })
    default:
      return t('common.terminal.fileTreeStatusIdle')
  }
})

function handleDownloadStart(name: string): void {
  download.value = queueFileTreeDownload(download.value, name)
}

function handleDownloadSettle(ok: boolean, error?: string): void {
  download.value = settleFileTreeDownload(download.value, ok, error)
}

function handleTransfer(_event: unknown, event: SftpTransferEvent): void {
  if (event.sessionId !== props.sessionId) return
  const nextQueue = reduceFileTreeTransferEvent(download.value, event)
  download.value = nextQueue
  if (event.status === 'running') {
    // 聚合采样:并发时速率=全部 running 任务的总带宽,正好回答"这批还要多久"
    const agg = aggregateFileTreeDownloads(nextQueue)
    transferSamples = pushTransferSample(transferSamples, {
      at: Date.now(),
      transferred: agg.knownTransferred,
      total: agg.total,
    })
    transferRate.value = windowTransferRate(transferSamples)
  }
}

onMounted(() => window.ipcRenderer?.on('terminal-sftp-transfer', handleTransfer))
onUnmounted(() => {
  window.ipcRenderer?.off('terminal-sftp-transfer', handleTransfer)
  clearLingerTimer()
})

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

/** 树实例:reveal 时调用 revealDirectory 在当前树内展开,避免重定根 */
const fileTreeRef = ref<{ revealDirectory: (path: string) => Promise<boolean> } | null>(null)

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
      clearLingerTimer()
      transferSamples = []
      transferRate.value = null
      download.value = EMPTY_FILE_TREE_DOWNLOAD_QUEUE
      navigateToRoot(reveal || '.')
      return
    }
    // 同会话内激活/打开预览:优先在当前树内逐级展开到文件所在目录(不再重定根);
    // 目标不在当前根下时才回退为导航
    if (reveal && reveal !== prevReveal) {
      const tree = fileTreeRef.value
      if (!tree) {
        if (reveal !== rootPath.value) navigateToRoot(reveal)
      } else {
        void tree.revealDirectory(reveal).then((handled) => {
          if (!handled && reveal !== rootPath.value) navigateToRoot(reveal)
        })
      }
    }
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
  /* 全局 #app text-align:center 会继承到此,路径行显式靠左 */
  overflow: hidden;
  padding: 3px 8px;
  color: var(--app-text-muted);
  font-size: 10px;
  text-align: left;
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
  display: grid;
  gap: 4px;
  padding: 6px 8px;
  color: var(--app-text-muted);
  font-size: 11px;
  border-top: 1px solid var(--app-border);
}
.file-tree-status__line {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 14px;
  gap: 6px;
}
.file-tree-status__text {
  overflow: hidden;
  flex: 1;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tree-status--error .file-tree-status__text {
  color: var(--el-color-error);
}
.file-tree-status__percent {
  flex: none;
  min-width: 4ch;
  color: var(--el-color-primary);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.file-tree-status__detail {
  overflow: hidden;
  min-width: 0;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tree-status__progress {
  position: relative;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-color-primary) 14%, transparent);
}
.file-tree-status__progress-fill {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
  background: var(--el-color-primary);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.2s ease;
}
.file-tree-status__progress-fill::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 55%), transparent);
  content: '';
  transform: translateX(-100%);
  animation: file-tree-progress-shimmer 1.4s linear infinite;
}
.file-tree-status__progress--indeterminate .file-tree-status__progress-fill {
  width: 35%;
  animation: file-tree-progress-indeterminate 1.1s ease-in-out infinite;
}
.file-tree-status__progress--indeterminate .file-tree-status__progress-fill::after {
  animation: none;
}
@keyframes file-tree-progress-shimmer {
  to {
    transform: translateX(100%);
  }
}
@keyframes file-tree-progress-indeterminate {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .file-tree-status__progress-fill,
  .file-tree-status__progress-fill::after {
    animation: none;
  }
}
</style>
