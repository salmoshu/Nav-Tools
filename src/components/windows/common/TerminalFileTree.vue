<template>
  <div
    ref="treeElement"
    class="terminal-file-tree"
    @pointerdown="onTreePointerDown"
    @pointermove="onTreePointerMove"
    @pointerup="onTreePointerUp"
    @pointercancel="onTreePointerCancel"
    @contextmenu="onTreeContextMenu"
  >
    <div v-if="truncatedEntryCount !== null" class="terminal-file-tree__truncated" role="status">
      {{ t('common.terminal.fileTreeTruncated', { count: truncatedEntryCount }) }}
    </div>
    <el-tree
      :key="treeKey"
      ref="treeRef"
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
      @node-click="onNodeClick"
    >
      <template #default="{ data }">
        <span
          class="terminal-file-tree__node"
          :class="{ 'terminal-file-tree__node--selected': selectedPaths.has(data.path) }"
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
      </template>
    </el-tree>
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        ref="contextMenuElement"
        class="file-tree-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @contextmenu.prevent
      >
        <button type="button" class="file-tree-context-menu__item" @click="onMenuCommand('download')">
          {{
            contextMenu.count > 1
              ? t('common.terminal.fileTreeDownloadMany', { count: contextMenu.count })
              : t('common.terminal.fileTreeDownload')
          }}
        </button>
        <button type="button" class="file-tree-context-menu__item" @click="onMenuCommand('copy-path')">
          {{ t('common.terminal.fileTreeCopyPath') }}
        </button>
        <button
          v-if="contextMenu.count === 1"
          type="button"
          class="file-tree-context-menu__item"
          @click="onMenuCommand('rename')"
        >
          {{ t('common.terminal.fileTreeRename') }}
        </button>
        <div class="file-tree-context-menu__divider" role="separator"></div>
        <button
          type="button"
          class="file-tree-context-menu__item file-tree-context-menu__item--danger"
          @click="onMenuCommand('delete')"
        >
          {{
            contextMenu.count > 1
              ? t('common.terminal.fileTreeDeleteMany', { count: contextMenu.count })
              : t('common.terminal.fileTreeDelete')
          }}
        </button>
      </div>
    </Teleport>
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
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { LoadFunction } from 'element-plus'
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

/** 多选集合:ctrl/cmd+点击切换;右键命中集合内节点时菜单批量作用于整个集合 */
const selectedPaths = reactive(new Set<string>())
/** 路径 → 节点条目(目录标志等),多选批量操作时要还原 entry 形状 */
const selectedEntries = new Map<string, SftpEntry>()

function clearSelection(): void {
  selectedPaths.clear()
  selectedEntries.clear()
}

type NodeClickArgs = [data: SftpEntry, node: unknown, comp: unknown, event?: MouseEvent]

/** 节点点击:ctrl/cmd+点击切换多选(不触发打开);普通点击清空多选并走原打开逻辑 */
function onNodeClick(...args: NodeClickArgs): void {
  const [data, , , event] = args
  if (event && (event.ctrlKey || event.metaKey)) {
    if (selectedPaths.has(data.path)) {
      selectedPaths.delete(data.path)
      selectedEntries.delete(data.path)
    } else {
      selectedPaths.add(data.path)
      selectedEntries.set(data.path, data)
    }
    return
  }
  clearSelection()
  emit('node-click', data)
}

/** 共享右键菜单:单实例委托,替代每节点 el-dropdown(偶发不弹/嵌套开销) */
const contextMenu = reactive({ visible: false, x: 0, y: 0, count: 0, targets: [] as SftpEntry[] })
const contextMenuElement = ref<HTMLElement | null>(null)

function closeContextMenu(): void {
  contextMenu.visible = false
}

function onTreeContextMenu(event: MouseEvent): void {
  const hit = treeNodeHitFrom(event.target as Element | null)
  if (!hit) return // 空白区不弹菜单
  event.preventDefault()
  // 命中已在多选集合内的节点:保持集合批量作用;否则重置为单选该节点
  if (!(selectedPaths.has(hit.path) && selectedPaths.size > 1)) {
    clearSelection()
    selectedPaths.add(hit.path)
    selectedEntries.set(hit.path, {
      name: hit.name,
      path: hit.path,
      directory: hit.directory,
      size: 0,
      modifiedAt: 0,
      mode: 0,
    })
  }
  contextMenu.targets = [...selectedEntries.values()]
  contextMenu.count = contextMenu.targets.length
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.visible = true
  // 视口钳制:下一帧实测尺寸后收进界内
  void nextTick(() => {
    const element = contextMenuElement.value
    if (!element) return
    contextMenu.x = Math.min(contextMenu.x, Math.max(8, window.innerWidth - element.offsetWidth - 8))
    contextMenu.y = Math.min(contextMenu.y, Math.max(8, window.innerHeight - element.offsetHeight - 8))
  })
}

function onMenuCommand(command: string): void {
  const targets = contextMenu.targets.slice()
  closeContextMenu()
  if (!targets.length) return
  if (command === 'download') void downloadEntries(targets)
  else if (command === 'copy-path') void copyPaths(targets)
  else if (command === 'rename' && targets.length === 1) void renameEntry(targets[0])
  else if (command === 'delete') void deleteEntries(targets)
}

/** 菜单打开后再点的第一下(任意键)关闭菜单;点菜单内部除外 */
function onGlobalPointerDown(event: PointerEvent): void {
  if (!contextMenu.visible) return
  if (contextMenuElement.value?.contains(event.target as Node)) return
  closeContextMenu()
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

/** 下载(支持多选批量):单条走原保存对话框;多条先选一个目标目录,再以原名并发落盘。
 * 每条独立 emit download-start/settle,底部状态栏按队列聚合成总进度 */
async function downloadEntries(entries: SftpEntry[]): Promise<void> {
  if (entries.length === 1) {
    await downloadEntry(entries[0])
    return
  }
  const dir = (await window.ipcRenderer.invoke('terminal-sftp-choose-download-dir')) as
    | string
    | null
  if (!dir) return
  const separator = dir.includes('\\') ? '\\' : '/'
  const base = dir.replace(/[\\/]+$/, '')
  await Promise.all(
    entries.map(async (entry) => {
      const localPath = `${base}${separator}${entry.name}`
      emit('download-start', entry.name)
      try {
        await window.ipcRenderer.invoke('terminal-session-download', {
          sessionId: props.sessionId,
          sessionPath: entry.path,
          localPath,
        })
        emit('download-settle', true)
      } catch (error) {
        emit('download-settle', false, errorMessage(error))
        ElMessage.error(
          t('common.terminal.fileTreeDownloadFailed', {
            name: entry.name,
            message: errorMessage(error),
          }),
        )
      }
    }),
  )
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
    snapshotExpandedKeys()
    treeKey.value += 1
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(t('common.terminal.fileTreeOpFailed', { message: errorMessage(error) }))
  }
}

/** 删除(支持多选批量):确认后逐条删除,成功即局部摘除节点并清理子孙展开键——
 * 不再整树刷新,其余目录的展开与滚动位置都不动 */
async function deleteEntries(entries: SftpEntry[]): Promise<void> {
  const many = entries.length > 1
  try {
    await ElMessageBox.confirm(
      many
        ? t('common.terminal.fileTreeDeleteManyConfirm', { count: entries.length })
        : entries[0].directory
          ? t('common.terminal.fileTreeDeleteDirectoryConfirm', { name: entries[0].name })
          : t('common.terminal.fileTreeDeleteFileConfirm', { name: entries[0].name }),
      many
        ? t('common.terminal.fileTreeDeleteMany', { count: entries.length })
        : t('common.terminal.fileTreeDelete'),
      { type: 'warning' },
    )
  } catch {
    return // 取消删除
  }
  let failed = 0
  for (const entry of entries) {
    try {
      await window.ipcRenderer.invoke('terminal-session-delete', {
        sessionId: props.sessionId,
        path: entry.path,
        directory: entry.directory,
      })
      removeLocalNode(entry.path)
      if (!many) ElMessage.success(t('common.terminal.fileTreeDeleteDone', { name: entry.name }))
    } catch (error) {
      failed += 1
      if (!many) {
        ElMessage.error(t('common.terminal.fileTreeOpFailed', { message: errorMessage(error) }))
      }
    }
  }
  if (!many) return
  const done = entries.length - failed
  if (done > 0) ElMessage.success(t('common.terminal.fileTreeDeleteManyDone', { count: done }))
  if (failed > 0) ElMessage.error(t('common.terminal.fileTreeDeleteFailedMany', { count: failed }))
}

/** 局部摘除:el-tree remove(key) 直接摘节点;同时清掉该路径及子孙的展开键与多选残留 */
function removeLocalNode(path: string): void {
  treeRef.value?.remove(path)
  const separator = path.includes('\\') ? '\\' : '/'
  for (const key of [...expandedSet]) {
    if (key === path || key.startsWith(path + separator)) expandedSet.delete(key)
  }
  selectedPaths.delete(path)
  selectedEntries.delete(path)
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
    snapshotExpandedKeys()
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

/** 出窗未就绪时的系统级跟随浮层状态:维持手上有文件的拖拽感 */
let dragOverlayShown = false
let overlayLastX = 0
let overlayLastY = 0
/** 最近一次指针的屏幕坐标:浮层是独立置顶窗,setPosition 用的是屏幕坐标系 */
let lastPointerScreenX = 0
let lastPointerScreenY = 0

/** 跟随浮层同步:仅出窗准备(preparing)且缓存未就绪时显示;位移 ≥3px 才重发,避免 IPC 刷屏 */
function syncDragOverlay(active: FileTreePointerGesture | null): void {
  const show =
    active !== null && active.phase === 'preparing' && !dragOutCache.has(active.payload.path)
  if (show && active) {
    const x = lastPointerScreenX
    const y = lastPointerScreenY
    if (!dragOverlayShown) {
      dragOverlayShown = true
      overlayLastX = x
      overlayLastY = y
      window.ipcRenderer.send('terminal-file-tree-drag-overlay', {
        action: 'show',
        name: active.payload.name,
        x,
        y,
      })
    } else if (Math.abs(x - overlayLastX) >= 3 || Math.abs(y - overlayLastY) >= 3) {
      overlayLastX = x
      overlayLastY = y
      window.ipcRenderer.send('terminal-file-tree-drag-overlay', { action: 'move', x, y })
    }
    return
  }
  if (dragOverlayShown) {
    dragOverlayShown = false
    window.ipcRenderer.send('terminal-file-tree-drag-overlay', { action: 'hide' })
  }
}

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
    syncDragOverlay(active)
    return
  }
  // 指针回窗:恢复应用内拖拽;后台下载不取消,完成时填入缓存
  if (active.phase === 'preparing' && exitFileTreeDragOutPrep(active)) dragGhost.preparing = false
  syncDragOverlay(active)
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
  lastPointerScreenX = event.screenX
  lastPointerScreenY = event.screenY
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
    // 手势一激活就预下载到临时缓存:指针出窗时多半已就绪,可同手势移交 OLE 拖放,
    // 落点即松手处的文件夹;仅在窗内完成的移动/插入只是多下一次临时副本
    if (!dragGhost.cached && !dragOutPreparing.has(active.payload.path)) {
      dragGhost.preparing = true
      void prepareDragOut(active.payload)
    }
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

/** Esc:优先关右键菜单,其次清多选,最后取消进行中的拖拽手势(不删已缓存文件) */
function onGestureKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (contextMenu.visible) {
    event.preventDefault()
    closeContextMenu()
    return
  }
  if (selectedPaths.size > 0) {
    clearSelection()
    return
  }
  if (!gesture) return
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
  syncDragOverlay(null)
}

/**
 * 拖出应用的预下载:拖拽手势一激活就把远端文件下载到系统临时缓存(状态栏复用聚合进度),
 * 指针出窗时不再临时开始下载。下载完成时按钮仍按住且指针在窗外 → 同一手势内移交
 * 系统 OLE 拖放,拖到哪落到哪;按钮已松开 → 武装缓存作为降级,提示「再拖一次」立即可用。
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
    if (active && active.payload.path === payload.path) {
      if (active.phase === 'preparing') {
        startSystemDrag(payload, localPath)
        return
      }
      // 指针仍在窗内:徽标切换为已就绪,出窗即可直接移交
      dragGhost.cached = true
      dragGhost.preparing = false
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

onMounted(() => {
  window.addEventListener('keydown', onGestureKeydown, true)
  document.addEventListener('pointerdown', onGlobalPointerDown, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGestureKeydown, true)
  document.removeEventListener('pointerdown', onGlobalPointerDown, true)
  cancelGesture()
  disarmDragOut()
  syncDragOverlay(null)
})

type FileTreeNode = SftpEntry & { isLeaf: boolean }

/** el-tree load 的精确签名:node.data 是宽松的 TreeNodeData,本树节点实为 FileTreeNode */
type ElTreeLoad = LoadFunction
type ElTreeData = Parameters<Parameters<ElTreeLoad>[1]>[0]

const treeProps = { label: 'name', children: 'children', isLeaf: 'isLeaf' }
/** el-tree 实例(结构类型):remove 局部摘节点;getNode 用于 reveal 的逐级展开 */
const treeRef = ref<{
  remove: (key: string) => void
  getNode: (key: string) => { expanded: boolean; expand: (callback?: () => void) => void } | null
} | null>(null)
const treeKey = ref(0)
const truncatedEntryCount = ref<number | null>(null)
let pendingLoads = 0
// 展开状态跨刷新保持: 删除/重命名等操作触发重建时, 已展开目录自动恢复。
// expandedSet 是唯一事实来源,expand/collapse 事件只维护它;
// expandedKeys 是喂给 default-expanded-keys 的重挂载快照,只在重建前更新——
// el-tree 会 watch 该 prop 并以 autoExpandParent 重新展开其中的键,
// 实时更新会让已折叠的祖先被残留的子孙键"复活"(折叠A后展开B,A也被展开)。
const expandedKeys = ref<string[]>([])
const expandedSet = new Set<string>()

/** 重挂载树前调用:把当前展开集合打快照给新树的 default-expanded-keys */
function snapshotExpandedKeys(): void {
  expandedKeys.value = [...expandedSet]
}

function rememberExpanded(data: SftpEntry): void {
  if (expandedSet.has(data.path)) return
  expandedSet.add(data.path)
}

function forgetExpanded(data: SftpEntry): void {
  expandedSet.delete(data.path)
}

/** 复制路径(支持多选):多条时一行一个 */
async function copyPaths(entries: SftpEntry[]): Promise<void> {
  const text = entries.map((entry) => entry.path).join('\n')
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(
      entries.length === 1
        ? t('common.terminal.fileTreeCopyPathDone', { path: text })
        : t('common.terminal.fileTreeCopyPathManyDone', { count: entries.length }),
    )
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

/** 根目录解析后的绝对路径:reveal 的前缀判定以它为准(props.rootPath 可能是 '.' 等相对形式) */
let resolvedRootPath = ''

const loadNode: ElTreeLoad = async (node, resolve) => {
  const root = node.level === 0
  const path = root ? props.rootPath : (node.data as FileTreeNode | undefined)?.path
  const dir = path ? await listDirectory(path, root) : null
  if (root && dir) {
    resolvedRootPath = dir.resolvedPath
    emit('root-resolved', dir.resolvedPath)
  }
  resolve(toNodes(dir?.entries ?? []) as ElTreeData)
}

/**
 * 预览揭示:在当前树内逐级展开到目标目录,不重定根目录。
 * 懒加载节点 expand(callback) 会先拉子级再展开,完成回调正好串起逐级展开;
 * expandedSet 手动同步(程序化展开不触发 node-expand 事件)。
 * 返回 false = 目标不在当前根下或链路节点缺失,由面板回退为导航。
 */
async function revealDirectory(dirPath: string): Promise<boolean> {
  const root = resolvedRootPath
  if (!root || !dirPath) return false
  if (dirPath === root) return true
  const separator = root.includes('\\') ? '\\' : '/'
  const prefix = root.endsWith(separator) ? root : root + separator
  if (!dirPath.startsWith(prefix)) return false
  const segments = dirPath.slice(prefix.length).split(separator).filter(Boolean)
  let current = root
  for (const segment of segments) {
    const childPath = joinFileTreePath(current, segment)
    const node = treeRef.value?.getNode(childPath)
    if (!node) return false
    if (!node.expanded) {
      expandedSet.add(childPath)
      await new Promise<void>((resolve) => node.expand(resolve))
    }
    current = childPath
  }
  return true
}

defineExpose({ revealDirectory })

function toNodes(entries: SftpEntry[]): FileTreeNode[] {
  return entries.map((entry) => ({ ...entry, isLeaf: !entry.directory }))
}

watch(
  () => [props.sessionId, props.rootPath],
  () => {
    closeContextMenu()
    clearSelection()
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
/* 共享右键菜单:teleport 到 body 的单实例菜单,替代每节点 el-dropdown */
.file-tree-context-menu {
  position: fixed;
  z-index: 9000;
  display: flex;
  min-width: 168px;
  flex-direction: column;
  padding: 4px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}
.file-tree-context-menu__item {
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  color: var(--app-text);
  background: transparent;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.file-tree-context-menu__item:hover {
  background: var(--app-hover);
}
.file-tree-context-menu__item--danger {
  color: var(--el-color-error);
}
.file-tree-context-menu__divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--app-border);
}
/* ctrl/cmd 多选中的节点底色 */
.terminal-file-tree__node--selected {
  border-radius: 4px;
  background: color-mix(in srgb, var(--el-color-primary) 16%, transparent);
}
</style>
