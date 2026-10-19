/**
 * 文件树拖拽的共享规则与跨组件手势状态:
 * 树内移动(el-tree draggable)、拖到终端窗格插入路径、拖出应用到系统临时缓存。
 */

/** 拖拽负载的自定义 MIME;dataTransfer 只在本应用窗口内可读,拖出窗口后系统拿不到它 */
export const FILE_TREE_DRAG_MIME = 'application/x-navtools-file-tree-node'

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
 * el-tree allow-drop 规则:只允许 inner 落入目录;prev/next(同级排序)对远端文件树
 * 没有意义,一律拒绝;落入自身/子孙一并拒绝。
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

/**
 * dragend 的指针坐标越出窗口即视为拖出应用:Chrome 在窗口外 drop 时回报视口外坐标
 * (可能为负或超过 innerWidth/innerHeight)。
 */
export function isOutsideWindow(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): boolean {
  return clientX < 0 || clientY < 0 || clientX > width || clientY > height
}

/**
 * 跨组件手势状态:文件树 dragstart 建立,树内/窗格 drop 标记已处理,
 * dragend 时依据 handledInApp 与坐标判定是否拖出窗口。
 */
export interface FileTreeDragGesture {
  payload: FileTreeDragPayload
  handledInApp: boolean
}

let currentGesture: FileTreeDragGesture | null = null

export function beginFileTreeDrag(payload: FileTreeDragPayload): FileTreeDragGesture {
  currentGesture = { payload, handledInApp: false }
  return currentGesture
}

export function markFileTreeDragHandled(): void {
  if (currentGesture) currentGesture.handledInApp = true
}

/** 结束手势并返回它;面板据此决定要不要进入拖出流程 */
export function endFileTreeDrag(): FileTreeDragGesture | null {
  const gesture = currentGesture
  currentGesture = null
  return gesture
}
