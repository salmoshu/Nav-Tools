import { describe, expect, it } from 'vitest'
import {
  COLLAPSED_PANEL_ROWS,
  expandPanel,
  togglePanelCollapsed,
  type CollapsiblePanel,
} from '@/core/layout/PanelCollapse'
import { LayoutStorage } from '@/core/layout/LayoutStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'

describe('panel collapse', () => {
  it('shrinks to the 42px header and restores the previous resized height', () => {
    const panel: CollapsiblePanel = { h: 9, minH: 5 }
    togglePanelCollapsed(panel)
    expect(panel.collapsed).toBe(true)
    expect(panel.h * 60).toBe(42)
    togglePanelCollapsed(panel)
    expect(panel).toEqual({ h: 9, minH: 5, collapsed: false })
  })

  it('keeps the saved expanded height when entering fullscreen and ignores expanded panels', () => {
    const panel: CollapsiblePanel = { h: COLLAPSED_PANEL_ROWS, collapsed: true, expandedH: 8 }
    expandPanel(panel)
    expect(panel.h).toBe(8)
    panel.h = 10
    expandPanel(panel)
    expect(panel.h).toBe(10)
  })

  it('persists the collapsed state and expanded height with the application layout', () => {
    localStorage.clear()
    const storage = new LayoutStorage(new JsonStorage(localStorage))
    storage.save(
      'collapse',
      [
        {
          titleName: 'Messages',
          componentName: 'RawMessages',
          windowId: 'raw-messages',
          x: 0,
          y: 0,
          w: 6,
          h: COLLAPSED_PANEL_ROWS,
          i: 'messages-1',
          collapsed: true,
          expandedH: 9,
        },
      ],
      false,
    )
    const panel = storage.load('collapse')!.items[0]
    expect(panel.collapsed).toBe(true)
    togglePanelCollapsed(panel)
    expect(panel.h).toBe(9)
  })
})
