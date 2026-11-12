import type { Component } from 'vue'
import {
  Aim,
  ChatLineSquare,
  Compass,
  Document,
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
  console: ChatLineSquare,
  terminal: Monitor,
  camera: VideoCamera,
  deviation: Aim,
  signal: Histogram,
  sky: Compass,
  config: Setting,
  map: MapLocation,
  radar: Aim,
  'lidar-plot': TrendCharts,
  'lidar-scores': Histogram,
  'lidar-inspector': Document,
  'gnssraw-frames': Monitor,
  'gnssraw-visibility': Compass,
  'gnssraw-gf': TrendCharts,
  'gnssraw-prnoise': Aim,
  'gnssraw-snr': Histogram,
  'gnssraw-eph': Document,
  'gnsslib-rtkpost': MapLocation,
  'gnsslib-solver': MapLocation,
  'gnsslib-rtknavi': Compass,
}

export function getPanelIconComponent(action?: string): Component {
  return (action && panelIconComponents[action]) || Grid
}
