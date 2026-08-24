import { describe, expect, it } from 'vitest'
import {
  createEmptyPane,
  createTerminalTab,
  findTerminalPane,
  listTerminalPanes,
  removeTerminalPane,
  splitTerminalPane,
  updateTerminalPane,
  updateTerminalSplitRatio,
} from '@/core/terminal/TerminalLayout'

describe('Terminal recursive split layout', () => {
  it('supports nested horizontal and vertical splits', () => {
    const tab = createTerminalTab()
    const first = tab.root.id
    expect(tab.focusedPaneId).toBe(first)
    const second = createEmptyPane()
    tab.root = splitTerminalPane(tab.root, first, 'horizontal', second)
    const third = createEmptyPane()
    tab.root = splitTerminalPane(tab.root, second.id, 'vertical', third)

    expect(tab.root.kind).toBe('split')
    expect(listTerminalPanes(tab.root).map((pane) => pane.id)).toEqual([first, second.id, third.id])
    expect(findTerminalPane(tab.root, third.id)).toBe(third)
  })

  it('stores and clamps draggable split ratios', () => {
    const first = createEmptyPane()
    const second = createEmptyPane()
    const root = splitTerminalPane(first, first.id, 'horizontal', second)

    expect(root).toMatchObject({ kind: 'split', ratio: 0.5 })
    if (root.kind !== 'split') throw new Error('Expected split layout')
    expect(updateTerminalSplitRatio(root, root.id, 0.01)).toMatchObject({ ratio: 0.05 })
    expect(updateTerminalSplitRatio(root, root.id, 0.99)).toMatchObject({ ratio: 0.95 })
  })

  it('collapses the parent split when a pane is removed', () => {
    const first = createEmptyPane()
    const second = createEmptyPane()
    const root = splitTerminalPane(first, first.id, 'horizontal', second)

    expect(removeTerminalPane(root, second.id)).toEqual(first)
  })

  it('attaches a main-process session id without mutating sibling panes', () => {
    const first = createEmptyPane()
    const second = createEmptyPane()
    const root = splitTerminalPane(first, first.id, 'vertical', second)
    const updated = updateTerminalPane(root, second.id, { sessionId: 'term-1', title: 'SSH host' })

    expect(findTerminalPane(updated, second.id)).toMatchObject({
      sessionId: 'term-1',
      title: 'SSH host',
    })
    expect(findTerminalPane(updated, first.id)?.sessionId).toBeUndefined()
  })
})
