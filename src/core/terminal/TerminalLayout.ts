import { createTerminalId, type TerminalLaunchSpec } from './TerminalTypes'

export type TerminalSplitDirection = 'horizontal' | 'vertical'

export interface TerminalPaneNode {
  kind: 'pane'
  id: string
  sessionId?: string
  title: string
  launch?: TerminalLaunchSpec
}

export interface TerminalSplitNode {
  kind: 'split'
  id: string
  direction: TerminalSplitDirection
  ratio: number
  first: TerminalLayoutNode
  second: TerminalLayoutNode
}

export type TerminalLayoutNode = TerminalPaneNode | TerminalSplitNode

export interface TerminalTabLayout {
  id: string
  title: string
  root: TerminalLayoutNode
  focusedPaneId?: string
}

export function createEmptyPane(title = 'Terminal'): TerminalPaneNode {
  return { kind: 'pane', id: createTerminalId('pane'), title }
}

export function createTerminalTab(title = 'Terminal'): TerminalTabLayout {
  const root = createEmptyPane(title)
  return { id: createTerminalId('tab'), title, root, focusedPaneId: root.id }
}

export function splitTerminalPane(
  root: TerminalLayoutNode,
  paneId: string,
  direction: TerminalSplitDirection,
  newPane: TerminalPaneNode = createEmptyPane(),
): TerminalLayoutNode {
  if (root.kind === 'pane') {
    if (root.id !== paneId) return root
    return {
      kind: 'split',
      id: createTerminalId('split'),
      direction,
      ratio: 0.5,
      first: root,
      second: newPane,
    }
  }
  return {
    ...root,
    first: splitTerminalPane(root.first, paneId, direction, newPane),
    second: splitTerminalPane(root.second, paneId, direction, newPane),
  }
}

export function updateTerminalSplitRatio(
  root: TerminalLayoutNode,
  splitId: string,
  ratio: number,
): TerminalLayoutNode {
  if (root.kind === 'pane') return root
  if (root.id === splitId) return { ...root, ratio: Math.min(0.95, Math.max(0.05, ratio)) }
  return {
    ...root,
    first: updateTerminalSplitRatio(root.first, splitId, ratio),
    second: updateTerminalSplitRatio(root.second, splitId, ratio),
  }
}

export function removeTerminalPane(
  root: TerminalLayoutNode,
  paneId: string,
): TerminalLayoutNode | null {
  if (root.kind === 'pane') return root.id === paneId ? null : root
  const first = removeTerminalPane(root.first, paneId)
  const second = removeTerminalPane(root.second, paneId)
  if (!first) return second
  if (!second) return first
  return { ...root, first, second }
}

export function updateTerminalPane(
  root: TerminalLayoutNode,
  paneId: string,
  update: Partial<Omit<TerminalPaneNode, 'kind' | 'id'>>,
): TerminalLayoutNode {
  if (root.kind === 'pane') return root.id === paneId ? { ...root, ...update } : root
  return {
    ...root,
    first: updateTerminalPane(root.first, paneId, update),
    second: updateTerminalPane(root.second, paneId, update),
  }
}

export function findTerminalPane(
  root: TerminalLayoutNode,
  paneId: string,
): TerminalPaneNode | undefined {
  if (root.kind === 'pane') return root.id === paneId ? root : undefined
  return findTerminalPane(root.first, paneId) ?? findTerminalPane(root.second, paneId)
}

export function listTerminalPanes(root: TerminalLayoutNode): TerminalPaneNode[] {
  if (root.kind === 'pane') return [root]
  return [...listTerminalPanes(root.first), ...listTerminalPanes(root.second)]
}

export function clearTerminalSessions(root: TerminalLayoutNode): TerminalLayoutNode {
  if (root.kind === 'pane') return { ...root, sessionId: undefined, title: 'Terminal' }
  return {
    ...root,
    first: clearTerminalSessions(root.first),
    second: clearTerminalSessions(root.second),
  }
}
