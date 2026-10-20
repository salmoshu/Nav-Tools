<template>
  <div
    ref="treeElement"
    class="terminal-file-tree"
    @pointerdown="onTreePointerDown"
    @pointermove="onTreePointerMove"
    @pointerup="onTreePointerUp"
    @pointercancel="onTreePointerCancel"
  >
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
          <span
            class="terminal-file-tree__node"
            :data-file-tree-path="data.path"
            :data-file-tree-dir="data.directory ? '1' : '0'"
            :data-file-tree-name="data.name"
          >
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
    <Teleport to="body">
      <div
        v-if="dragGhost.visible"
        class="file-tree-drag-ghost"
        :class="{ 'file-tree-drag-ghost--preparing': dragGhost.preparing }"
        :style="{ transform: `translate(${dragGhost.x + 14}px, ${dragGhost.y + 16}px)` }"
      >
        <el-icon class="file-tree-drag-ghost__icon">
          <Folder v-if="dragGhost.directory" />
          <Document v-else />
        </el-icon>
        <span class="file-tree-drag-ghost__name">{{ dragGhost.name }}</span>
        <span v-if="dragGhost.preparing" class="file-tree-drag-ghost__badge">
          {{ t('common.terminal.fileTreeDragPreparing') }}
        </span>
        <span
          v-else-if="dragGhost.cached"
          class="file-tree-drag-ghost__badge file-tree-drag-ghost__badge--ready"
        >
          {{ t('common.terminal.fileTreeDragOutCached') }}
        </span>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Folder } from '@element-plus/icons-vue'
import {
  activateFileTreeDrag,
  beginFileTreePointerDrag,
  completeFileTreeDragOutPrep,
  enterFileTreeDragOutPrep,
  exitFileTreeDragOutPrep,
  fileTreePaneTargetById,
  fileTreePaneTargetForElement,
  finishFileTreeGesture,
  isFileTreePointerOutside,
  isNoopFileTreeMove,
  joinFileTreePath,
  resolveFileTreeHitTarget,
  setFileTreeGestureHover,
  setFileTreePaneHover,
  trackFileTreePointer,
  type FileTreeDragPayload,
  type FileTreePointerGesture,
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

/** 拖入目录 = 远端移动:复用三通道 rename IPC(SSH SFTP / 本机 fs.rename / WSL mv) */
async function moveEntry(source: SftpEntry, targetDir: SftpEntry): Promise<void> {
  const newPath = joinFileTreePath(targetDir.path, source.name)
  // 指针拖拽不改客户端树模型,但移动/覆盖同样要重建回服务端真实状态
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

/** 拖拽进行中:给树加拖拽态类名,目标目录的品牌蓝高亮见样式表的 is-drop-inner 规则 */
const treeDragging = ref(false)
const treeElement = ref<HTMLElement | null>(null)

/** 当前指针拖拽手势;null = 无手势(状态机纯函数在 FileTreeDrag.ts,可单测) */
let gesture: FileTreePointerGesture | null = null
/** 拖拽幽灵:跟随光标的浮动卡片(半透明、品牌蓝描边),出窗准备时显示进度徽标 */
const dragGhost = reactive({
  visible: false,
  x: 0,
  y: 0,
  name: '',
  directory: false,
  preparing: false,
  cached: false,
})
/** 当前高亮的树内目录行(.el-tree-node__content 元素,命中判定时一并拿到) */
let hoverTreeDirElement: HTMLElement | null = null
/** 出窗松手时缓存未就绪:下载完成时武装并提示一次「再拖一次」 */
let notifyArmOnReady: string | null = null

/** 拖出应用的临时缓存:远端路径 → 已就绪的本地临时文件 */
const dragOutCache = new Map<string, string>()
/** 正在下载到临时缓存的路径(防重入) */
const dragOutPreparing = new Set<string>()
/** 上次拖出未遂后武装的路径:武装期内完成提示只发一次;60s 后过期 */
let armedDragOutPath: string | null = null
let armedTimer: ReturnType<typeof setTimeout> | undefined
/** 武装有效期:超时后该条目恢复为普通应用内拖拽反馈 */
const DRAG_OUT_ARM_MS = 60_000

interface TreeNodeHit {
  path: string
  name: string
  directory: boolean
  contentElement: HTMLElement
}

/** 命中元素所在的树节点:数据属性挂在节点内容区的 span 上(整行内容区都可命中) */
function treeNodeHitFrom(element: Element | null): TreeNodeHit | null {
  const content = element?.closest('.el-tree-node__content')
  if (!content || !treeElement.value?.contains(content)) return null
  const span = content.querySelector('[data-file-tree-path]')
  const path = span?.getAttribute('data-file-tree-path')
  if (!span || !path) return null
  return {
    path,
    name: span.getAttribute('data-file-tree-name') ?? path,
    directory: span.getAttribute('data-file-tree-dir') === '1',
    contentElement: content as HTMLElement,
  }
}

/** 树内目录高亮:is-drop-inner 复用原 el-tree 品牌蓝高亮样式 */
function setHoverTreeDirElement(element: HTMLElement | null): void {
  if (hoverTreeDirElement === element) return
  hoverTreeDirElement?.classList.remove('is-drop-inner')
  hoverTreeDirElement = element
  hoverTreeDirElement?.classList.add('is-drop-inner')
}

/** 每次移动重算落点:窗口外 > 终端窗格 > 树内目录 > 无;出窗即进入准备拖出 */
function updateGestureHover(active: FileTreePointerGesture): void {
  const { lastX, lastY } = active
  const inside = !isFileTreePointerOutside(lastX, lastY, window.innerWidth, window.innerHeight)
  const hit = inside ? document.elementFromPoint(lastX, lastY) : null
  // 本树命中优先:GUI 视图的内联树本身就在某个 .terminal-pane 里,
  // 先问树再问窗格,树内行永不误判成窗格插入
  const treeHit = treeNodeHitFrom(hit)
  const pane = treeHit ? null : fileTreePaneTargetForElement(hit)
  const hover = resolveFileTreeHitTarget({
    insideWindow: inside,
    paneId: pane?.paneId ?? null,
    treeDir: treeHit ? { path: treeHit.path, directory: treeHit.directory } : null,
    draggingPath: active.payload.path,
  })
  setFileTreeGestureHover(active, hover)
  setFileTreePaneHover(hover.kind === 'pane' ? pane : null)
  setHoverTreeDirElement(hover.kind === 'tree-dir' && treeHit ? treeHit.contentElement : null)
  if (hover.kind === 'outside') {
    if (enterFileTreeDragOutPrep(active)) {
      dragGhost.preparing = true
      void prepareDragOut(active.payload)
    }
    return
  }
  // 指针回窗:恢复应用内拖拽;后台下载不取消,完成时填入缓存
  if (active.phase === 'preparing' && exitFileTreeDragOutPrep(active)) dragGhost.preparing = false
}

function onTreePointerDown(event: PointerEvent): void {
  // 只认鼠标/触控笔左键;触摸留给树的滚动手势
  if (event.button !== 0 || event.pointerType === 'touch') return
  // 上一次手势可能孤儿化(pending 未捕获指针时在窗外松手,pointerup 丢失):直接重置
  if (gesture) cancelGesture()
  const hit = treeNodeHitFrom(event.target as Element | null)
  if (!hit) return
  notifyArmOnReady = null
  gesture = beginFileTreePointerDrag(
    { sessionId: props.sessionId, path: hit.path, name: hit.name, directory: hit.directory },
    event.pointerId,
    event.clientX,
    event.clientY,
  )
  // 阈值内不 setPointerCapture、不 preventDefault:单击/双击展开选择完全不受影响
}

function onTreePointerMove(event: PointerEvent): void {
  const active = gesture
  if (!active || event.pointerId !== active.pointerId) return
  trackFileTreePointer(active, event.clientX, event.clientY)
  if (active.phase === 'pending') {
    if (!activateFileTreeDrag(active)) return
    // 激活瞬间才捕获指针:之后 move/up 直达树容器,也不会误触节点 click/展开
    treeElement.value?.setPointerCapture(event.pointerId)
    treeDragging.value = true
    document.body.classList.add('file-tree-dragging')
    dragGhost.visible = true
    dragGhost.name = active.payload.name
    dragGhost.directory = active.payload.directory
    dragGhost.cached = dragOutCache.has(active.payload.path)
  }
  dragGhost.x = event.clientX
  dragGhost.y = event.clientY
  updateGestureHover(active)
}

function onTreePointerUp(event: PointerEvent): void {
  const active = gesture
  if (!active || event.pointerId !== active.pointerId) return
  if (active.phase === 'pending') {
    // 阈值内松手 = 单击:全程未捕获未拦截,el-tree 的 node-click 照常触发
    gesture = null
    return
  }
  const outcome = finishFileTreeGesture(active)
  const payload = active.payload
  cleanupGesture()
  gesture = null
  switch (outcome.kind) {
    case 'move': {
      // 手势载荷还原出移动所需的条目形状;目标目录只需路径(规则已校验是目录)
      const source: SftpEntry = {
        name: payload.name,
        path: payload.path,
        directory: payload.directory,
        size: 0,
        modifiedAt: 0,
        mode: 0,
      }
      const targetDir: SftpEntry = {
        name: '',
        path: outcome.targetDirPath,
        directory: true,
        size: 0,
        modifiedAt: 0,
        mode: 0,
      }
      void moveEntry(source, targetDir)
      break
    }
    case 'insert-path':
      // 窗格注册回调内部按目标 shell 家族转义后写入会话输入
      fileTreePaneTargetById(outcome.paneId)?.insert(payload)
      break
    case 'arm-drag-out':
      armAfterReleaseOutside(payload)
      break
    default:
      break
  }
}

function onTreePointerCancel(event: PointerEvent): void {
  const active = gesture
  if (!active || event.pointerId !== active.pointerId) return
  cancelGesture()
}

/** Esc 取消手势:不删除已缓存文件;在途下载完成后静默武装缓存 */
function onGestureKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !gesture) return
  event.preventDefault()
  cancelGesture()
}

function cancelGesture(): void {
  cleanupGesture()
  gesture = null
}

/** 手势收尾:释放指针捕获、撤掉幽灵与高亮。external 相位时 OLE 已接管,这里只清理 */
function cleanupGesture(): void {
  const active = gesture
  if (active && treeElement.value?.hasPointerCapture(active.pointerId)) {
    treeElement.value.releasePointerCapture(active.pointerId)
  }
  treeDragging.value = false
  document.body.classList.remove('file-tree-dragging')
  dragGhost.visible = false
  dragGhost.preparing = false
  setHoverTreeDirElement(null)
  setFileTreePaneHover(null)
}

/**
 * 拖出应用:远端文件先下载到系统临时目录(状态栏复用聚合进度)。
 * 下载完成时按钮仍按住且指针仍在窗外 → 同一手势内移交系统 OLE 拖放,拖到哪落到哪;
 * 按钮已松开 → 武装缓存作为降级,提示「再拖一次」立即可用。
 */
async function prepareDragOut(payload: FileTreeDragPayload): Promise<void> {
  const cached = dragOutCache.get(payload.path)
  if (cached) {
    startSystemDrag(payload, cached)
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
    const active = gesture
    if (active && active.payload.path === payload.path && active.phase === 'preparing') {
      startSystemDrag(payload, localPath)
      return
    }
    armDragOut(payload.path)
    if (notifyArmOnReady === payload.path) {
      notifyArmOnReady = null
      ElMessage.success(t('common.terminal.fileTreeDragOutReady', { name: payload.name }))
    }
  } catch (error) {
    emit('download-settle', false, errorMessage(error))
    ElMessage.error(t('common.terminal.fileTreeOpFailed', { message: errorMessage(error) }))
    if (gesture?.payload.path === payload.path) cancelGesture()
  } finally {
    dragOutPreparing.delete(payload.path)
  }
}

/** 移交系统拖出:先释放指针捕获再发 startDrag,避免捕获抢占 OLE 的鼠标消息 */
function startSystemDrag(payload: FileTreeDragPayload, localPath: string): void {
  const active = gesture
  if (active && active.payload.path === payload.path) completeFileTreeDragOutPrep(active)
  cleanupGesture()
  gesture = null
  window.ipcRenderer.send('terminal-file-tree-start-drag', { path: localPath })
}

/** 出窗松手时缓存未就绪的收尾:已缓存直接武装并提示;在途则标记完成时提示一次 */
function armAfterReleaseOutside(payload: FileTreeDragPayload): void {
  if (dragOutCache.has(payload.path)) {
    armDragOut(payload.path)
    ElMessage.success(t('common.terminal.fileTreeDragOutReady', { name: payload.name }))
    return
  }
  if (dragOutPreparing.has(payload.path)) notifyArmOnReady = payload.path
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

onMounted(() => window.addEventListener('keydown', onGestureKeydown, true))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGestureKeydown, true)
  cancelGesture()
  disarmDragOut()
})

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
/* 拖拽态:品牌蓝高亮可落入的目标目录(指针手势命中时给内容区加 is-drop-inner) */
.terminal-file-tree__tree--dragging :deep(.el-tree-node__content) {
  transition: background 0.12s ease;
}
.terminal-file-tree :deep(.el-tree-node__content.is-drop-inner) {
  background: color-mix(in srgb, var(--el-color-primary) 16%, transparent);
  box-shadow: inset 0 0 0 1px var(--el-color-primary);
  border-radius: 6px;
}
/* 拖拽幽灵:跟随光标的文件名卡片,半透明 + 品牌蓝描边;不拦截命中判定 */
.file-tree-drag-ghost {
  position: fixed;
  z-index: 9200;
  top: 0;
  left: 0;
  display: flex;
  max-width: 320px;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--el-color-primary);
  border-radius: 8px;
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-surface) 82%, transparent);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--el-color-primary) 24%, transparent);
  font-size: 12px;
  opacity: 0.92;
  pointer-events: none;
}
.file-tree-drag-ghost__icon {
  flex: none;
  color: var(--el-color-primary);
}
.file-tree-drag-ghost__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tree-drag-ghost__badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 6px;
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 14%, transparent);
  font-size: 11px;
}
.file-tree-drag-ghost--preparing .file-tree-drag-ghost__badge {
  animation: file-tree-drag-ghost-blink 1s ease-in-out infinite;
}
.file-tree-drag-ghost__badge--ready {
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 14%, transparent);
}
@keyframes file-tree-drag-ghost-blink {
  50% {
    opacity: 0.45;
  }
}
</style>
