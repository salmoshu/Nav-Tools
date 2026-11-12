// Grid Layout Plus adds no internal row gap below one row; header + border occupy 42 px.
export const COLLAPSED_PANEL_ROWS = 42 / 60
export const DEFAULT_PANEL_MIN_HEIGHT_ROWS = 2

export interface CollapsiblePanel {
  h: number
  minH?: number
  collapsed?: boolean
  expandedH?: number
}

export function expandPanel(panel: CollapsiblePanel): void {
  if (!panel.collapsed) return
  panel.h = Math.max(panel.minH ?? DEFAULT_PANEL_MIN_HEIGHT_ROWS, panel.expandedH ?? 6)
  panel.collapsed = false
  delete panel.expandedH
}

export function togglePanelCollapsed(panel: CollapsiblePanel): void {
  if (panel.collapsed) {
    expandPanel(panel)
  } else {
    panel.expandedH = panel.h
    panel.h = COLLAPSED_PANEL_ROWS
    panel.collapsed = true
  }
}
