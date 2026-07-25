import type { Component } from 'vue'
import {
  Aim,
  Compass,
  Grid,
  Histogram,
  MapLocation,
  Monitor,
  Setting,
  TrendCharts,
  VideoCamera,
} from '@element-plus/icons-vue'

export const panelIconComponents: Readonly<Record<string, Component>> = {
  data: TrendCharts,
  console: Monitor,
  camera: VideoCamera,
  deviation: Aim,
  signal: Histogram,
  sky: Compass,
  config: Setting,
  map: MapLocation,
}

export function getPanelIconComponent(action?: string): Component {
  return (action && panelIconComponents[action]) || Grid
}
