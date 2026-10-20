/**
 * 文件树拖拽的共享规则与指针拖拽手势状态机:
 * 树内移动(自实现指针拖拽)、拖到终端窗格插入路径、拖出应用经系统 OLE 落到目标文件夹。
 *
 * 拖拽不走 HTML5 draggable:HTML5 拖拽会话一旦开始,主进程的 webContents.startDrag
 * 无法在同一手势内接管,窗口外也没有 drop target(只会显示禁止图标)。自实现指针拖拽
 * 让手势全程由渲染层掌控,指针出窗后下载就绪即可在同一手势内移交系统拖放。
 */

/** 拖拽负载:手势全程保存在渲染层内存,不再依赖 dataTransfer(窗口外系统拿不到它) */
export interface FileTreeDragPayload {
  sessionId: string
  path: string
  name: string
  directory: boolean
}

/** 目标目录内拼出移动后的路径:分隔符跟随目标目录自身风格(本机 '\\',远端 '/') */
export function joinFileTreePath(directory: string, name: string): string {
  const separator = directory.includes('\\') ? '\\' : '/'
  return directory.endsWith(separator) ? `${directory}${name}` : `${directory}${separator}${name}`
}

/** target 是否为 source 本身或其后代(目录拖进自身/子孙会形成环,必须禁止) */
export function isSelfOrDescendant(source: string, target: string): boolean {
  if (source === target) return true
  const separator = source.includes('\\') ? '\\' : '/'
  const prefix = source.endsWith(separator) ? source : `${source}${separator}`
  return target.startsWith(prefix)
}

export type FileTreeDropPosition = 'prev' | 'inner' | 'next'

export interface FileTreeDragNodeLike {
  path: string
  directory: boolean
}

/**
 * 树内落点规则:只允许落入目录(inner);prev/next(同级排序)对远端文件树没有意义,
 * 一律拒绝;落入自身/子孙一并拒绝。自定义指针拖拽只有 inner 一种落点,判定等价。
 */
export function canDropFileTreeNode(
  dragging: FileTreeDragNodeLike,
  target: FileTreeDragNodeLike,
  position: FileTreeDropPosition,
): boolean {
  if (position !== 'inner') return false
  if (!target.directory) return false
  return !isSelfOrDescendant(dragging.path, target.path)
}

/** 移动是否无操作:目标目录就是源所在目录(新旧路径相同) */
export function isNoopFileTreeMove(sourcePath: string, name: string, targetDir: string): boolean {
  return joinFileTreePath(targetDir, name) === sourcePath
}

/** Windows 临时文件名净化:远端 POSIX 名可能含 Windows 非法字符或结尾点/空格 */
export function sanitizeDragTempName(name: string): string {
  // eslint-disable-next-line no-control-regex -- 控制字符本就在净化范围内
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '')
  return cleaned || '_'
}

/* ------------------------------------------------------------------ */
/* 指针拖拽手势状态机(纯函数,组件只负责 DOM 命中与副作用)            */
/* ------------------------------------------------------------------ */

/** 拖拽激活阈值:按下后位移超过该值才算拖拽,阈值内不干扰单击/双击展开选择 */
export const FILE_TREE_DRAG_THRESHOLD_PX = 4

/**
 * 手势相位:
 * - pending:已按下未过阈值,单击/双击行为不受影响;
 * - dragging:应用内拖拽中,候选落点是树内目录或终端窗格;
 * - preparing:指针已出窗口且按键仍按住,正在下载临时缓存,就绪即移交系统拖出;
 * - external:已移交系统 OLE 拖拽,光标与落点由 OS 接管。
 */
export type FileTreeGesturePhase = 'pending' | 'dragging' | 'preparing' | 'external'

/** 命中判定结果:指针当前悬停的落点类别 */
export type FileTreeGestureHover =
  | { kind: 'none' }
  | { kind: 'tree-dir'; path: string }
  | { kind: 'pane'; paneId: string }
  | { kind: 'outside' }

export interface FileTreePointerGesture {
  readonly payload: FileTreeDragPayload
  readonly pointerId: number
  /** 按下点坐标:激活阈值的判定基准,全程不变 */
  readonly originX: number
  readonly originY: number
  phase: FileTreeGesturePhase
  lastX: number
  lastY: number
  hover: FileTreeGestureHover
}

/** pointerdown:建立 pending 手势。组件需先忽略非左键与触摸(触摸留给树滚动) */
export function beginFileTreePointerDrag(
  payload: FileTreeDragPayload,
  pointerId: number,
  x: number,
  y: number,
): FileTreePointerGesture {
  return {
    payload,
    pointerId,
    originX: x,
    originY: y,
    phase: 'pending',
    lastX: x,
    lastY: y,
    hover: { kind: 'none' },
  }
}

/** 每次 pointermove 记录最新位置;相位迁移由专用函数完成 */
export function trackFileTreePointer(gesture: FileTreePointerGesture, x: number, y: number): void {
  gesture.lastX = x
  gesture.lastY = y
}

/** 指针坐标是否越出窗口(出窗即准备拖出应用;坐标可能为负或超过视口尺寸) */
export function isFileTreePointerOutside(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): boolean {
  return clientX < 0 || clientY < 0 || clientX > width || clientY > height
}

/** 位移是否已过激活阈值(pending → dragging 的判定依据) */
export function fileTreeDragExceededThreshold(gesture: FileTreePointerGesture): boolean {
  return (
    Math.abs(gesture.lastX - gesture.originX) > FILE_TREE_DRAG_THRESHOLD_PX ||
    Math.abs(gesture.lastY - gesture.originY) > FILE_TREE_DRAG_THRESHOLD_PX
  )
}

/** 过阈值即激活拖拽;返回是否发生了迁移(组件据此捕获指针、显示拖拽幽灵) */
export function activateFileTreeDrag(gesture: FileTreePointerGesture): boolean {
  if (gesture.phase !== 'pending' || !fileTreeDragExceededThreshold(gesture)) return false
  gesture.phase = 'dragging'
  return true
}

/**
 * 命中判定(纯规则):窗口外 > 终端窗格 > 树内目录 > 无。
 * 树内目录复用 allow-drop 规则:必须是可以落入的目录(禁止文件/自身/子孙)。
 */
export function resolveFileTreeHitTarget(input: {
  insideWindow: boolean
  paneId?: string | null
  treeDir?: FileTreeDragNodeLike | null
  draggingPath: string
}): FileTreeGestureHover {
  if (!input.insideWindow) return { kind: 'outside' }
  if (input.paneId) return { kind: 'pane', paneId: input.paneId }
  if (
    input.treeDir &&
    canDropFileTreeNode({ path: input.draggingPath, directory: true }, input.treeDir, 'inner')
  ) {
    return { kind: 'tree-dir', path: input.treeDir.path }
  }
  return { kind: 'none' }
}

/** 更新悬停落点;phase 迁移(出窗准备/回窗恢复)由下面的专用函数完成 */
export function setFileTreeGestureHover(
  gesture: FileTreePointerGesture,
  hover: FileTreeGestureHover,
): void {
  gesture.hover = hover
}

/** 指针出窗:dragging → preparing(组件据此启动/复用临时缓存下载) */
export function enterFileTreeDragOutPrep(gesture: FileTreePointerGesture): boolean {
  if (gesture.phase !== 'dragging') return false
  gesture.phase = 'preparing'
  return true
}

/** 指针回窗:preparing → dragging(后台下载不取消,完成时填入缓存) */
export function exitFileTreeDragOutPrep(gesture: FileTreePointerGesture): boolean {
  if (gesture.phase !== 'preparing') return false
  gesture.phase = 'dragging'
  return true
}

/**
 * 缓存下载完成且按钮仍按住、指针仍在窗外:preparing → external。
 * 返回 true 时组件立即触发主进程 startDrag,OLE 从当前指针状态接管。
 */
export function completeFileTreeDragOutPrep(gesture: FileTreePointerGesture): boolean {
  if (gesture.phase !== 'preparing') return false
  gesture.phase = 'external'
  return true
}

/** 松手(pointerup)时的手势结论:组件按结论执行移动/插入/武装缓存/放行点击 */
export type FileTreeGestureOutcome =
  | { kind: 'click' }
  | { kind: 'move'; targetDirPath: string }
  | { kind: 'insert-path'; paneId: string }
  | { kind: 'arm-drag-out' }
  | { kind: 'noop' }

export function finishFileTreeGesture(gesture: FileTreePointerGesture): FileTreeGestureOutcome {
  switch (gesture.phase) {
    case 'pending':
      // 阈值内松手:不是拖拽,点击行为完全不受影响
      return { kind: 'click' }
    case 'preparing':
      // 出窗松手时缓存尚未就绪:下载继续,完成后武装缓存(降级为「再拖一次」)
      return { kind: 'arm-drag-out' }
    case 'external':
      // 已移交系统拖拽,松手与否都由 OS 处理
      return { kind: 'noop' }
    case 'dragging':
      switch (gesture.hover.kind) {
        case 'tree-dir':
          return { kind: 'move', targetDirPath: gesture.hover.path }
        case 'pane':
          return { kind: 'insert-path', paneId: gesture.hover.paneId }
        case 'outside':
          return { kind: 'arm-drag-out' }
        default:
          return { kind: 'noop' }
      }
  }
}

/* ------------------------------------------------------------------ */
/* 终端窗格落点注册表:窗格挂载时登记,手势命中时按 paneId 找回插入回调 */
/* ------------------------------------------------------------------ */

export interface FileTreePaneDropTarget {
  paneId: string
  element: HTMLElement
  /** 命中松手时把路径按该窗格 shell 家族转义后写入会话输入 */
  insert: (payload: FileTreeDragPayload) => void
}

const paneDropTargets = new Map<string, FileTreePaneDropTarget>()
let hoveredPaneTarget: FileTreePaneDropTarget | null = null

export function registerFileTreePaneTarget(target: FileTreePaneDropTarget): void {
  paneDropTargets.set(target.paneId, target)
}

export function unregisterFileTreePaneTarget(paneId: string): void {
  const target = paneDropTargets.get(paneId)
  if (target && hoveredPaneTarget === target) {
    target.element.classList.remove('file-tree-drop-target')
    hoveredPaneTarget = null
  }
  paneDropTargets.delete(paneId)
}

/** 按 paneId 找回已注册的窗格落点(未注册/已卸载返回 null) */
export function fileTreePaneTargetById(paneId: string): FileTreePaneDropTarget | null {
  return paneDropTargets.get(paneId) ?? null
}

/** 从命中元素向上找已注册的终端窗格(.terminal-pane 根元素即注册元素) */
export function fileTreePaneTargetForElement(element: Element | null): FileTreePaneDropTarget | null {
  const paneElement = element?.closest('.terminal-pane')
  if (!paneElement) return null
  for (const target of paneDropTargets.values()) {
    if (target.element === paneElement) return target
  }
  return null
}

/** 同步窗格高亮:同一手势至多一个窗格带品牌蓝虚线框 */
export function setFileTreePaneHover(target: FileTreePaneDropTarget | null): void {
  if (hoveredPaneTarget === target) return
  hoveredPaneTarget?.element.classList.remove('file-tree-drop-target')
  hoveredPaneTarget = target
  hoveredPaneTarget?.element.classList.add('file-tree-drop-target')
}
