import { defineComponent, h, type Component } from 'vue'
import {
  Aim,
  Camera,
  ChatLineSquare,
  Compass,
  Document,
  Grid,
  Histogram,
  MapLocation,
  Monitor,
  Operation,
  Setting,
  TrendCharts,
} from '@element-plus/icons-vue'

const HEX_ICON_CONTENT = `
  <path fill-rule="evenodd" d="M512 64 912 296v432L512 960 112 728V296L512 64Zm0 72L176 328v368l336 192 336-192V328L512 136Z"/>
  <text x="512" y="584" text-anchor="middle" font-family="Consolas, monospace" font-size="220" font-weight="700">HEX</text>
`

export const panelIconSvg: Readonly<Record<string, string>> = {
  'hex-message': `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">${HEX_ICON_CONTENT}</svg>`,
}

const HexMessageIcon = defineComponent(
  () => () =>
    h('svg', {
      viewBox: '0 0 1024 1024',
      xmlns: 'http://www.w3.org/2000/svg',
      innerHTML: HEX_ICON_CONTENT,
      'aria-hidden': 'true',
    }),
)

export const panelIconComponents: Readonly<Record<string, Component>> = {
  data: TrendCharts,
  console: ChatLineSquare,
  terminal: Monitor,
  camera: Camera,
  deviation: Aim,
  signal: Histogram,
  sky: Compass,
  config: Setting,
  'camera-config': Operation,
  'hex-message': HexMessageIcon,
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
