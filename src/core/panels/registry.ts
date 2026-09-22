export type ApplicationIcon =
  | 'grid'
  | 'trend'
  | 'position'
  | 'motor'
  | 'camera'
  | 'robot'
  | 'satellite'
  | 'compass'
  | 'data'
  | 'monitor'
  | 'settings'
  | 'connection'
  | 'power'
  | 'vehicle'
  | 'tools'
  | 'cpu'
  | 'map'
  | 'target'
  | 'gauge'
  | 'chart'
  | 'radar'
export type PanelDataMode = 'general' | 'flow' | 'gnss' | 'motor'
export type PanelCatalogGroup = 'general' | 'flow' | 'gnss' | 'camera' | 'lidar' | 'gnssraw'

export interface UserApplication {
  id: string
  name: string
  description: string
  icon: ApplicationIcon
  accent: string
  windowIds: string[]
}

export interface PanelDefinition {
  id: string
  moduleId: string
  appMode: string
  funcMode: PanelDataMode
  catalogGroup: PanelCatalogGroup
  action: string
  title: string
  description: string
  componentName: string
  componentPath: string
}

export const panelRegistry: readonly PanelDefinition[] = [
  {
    id: 'plot',
    moduleId: 'general',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'general',
    action: 'data',
    title: 'panel.plot.title',
    description: 'panel.plot.desc',
    componentName: 'Plot',
    componentPath: '@/components/windows/common/Plot.vue',
  },
  {
    id: 'raw-messages',
    moduleId: 'general',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'general',
    action: 'console',
    title: 'panel.raw-messages.title',
    description: 'panel.raw-messages.desc',
    componentName: 'RawMessages',
    componentPath: '@/components/windows/common/RawMessages.vue',
  },
  {
    id: 'terminal',
    moduleId: 'general',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'general',
    action: 'terminal',
    title: 'panel.terminal.title',
    description: 'panel.terminal.desc',
    componentName: 'Terminal',
    componentPath: '@/components/windows/common/Terminal.vue',
  },
  {
    id: 'camera-video',
    moduleId: 'general',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'camera',
    action: 'camera',
    title: 'panel.camera-video.title',
    description: 'panel.camera-video.desc',
    componentName: 'CameraVideo',
    componentPath: '@/components/windows/common/CameraVideo.vue',
  },
  {
    id: 'camera-parameters',
    moduleId: 'general',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'camera',
    action: 'config',
    title: 'panel.camera-parameters.title',
    description: 'panel.camera-parameters.desc',
    componentName: 'CameraParameters',
    componentPath: '@/components/windows/common/CameraParameters.vue',
  },
  {
    id: 'flow-deviation',
    moduleId: 'flow',
    appMode: 'robot',
    funcMode: 'flow',
    catalogGroup: 'general',
    action: 'deviation',
    title: 'panel.flow-deviation.title',
    description: 'panel.flow-deviation.desc',
    componentName: 'FlowDeviation',
    componentPath: '@/components/windows/common/FlowDeviation.vue',
  },
  {
    id: 'gnss-map',
    moduleId: 'gnss',
    appMode: 'pos',
    funcMode: 'gnss',
    catalogGroup: 'gnss',
    action: 'map',
    title: 'panel.gnss-map.title',
    description: 'panel.gnss-map.desc',
    componentName: 'GnssMap',
    componentPath: '@/components/windows/gnss/GnssMap.vue',
  },
  {
    id: 'gnss-deviation',
    moduleId: 'gnss',
    appMode: 'pos',
    funcMode: 'gnss',
    catalogGroup: 'gnss',
    action: 'deviation',
    title: 'panel.gnss-deviation.title',
    description: 'panel.gnss-deviation.desc',
    componentName: 'GnssDeviation',
    componentPath: '@/components/windows/gnss/GnssDeviation.vue',
  },
  {
    id: 'gnss-signals',
    moduleId: 'gnss',
    appMode: 'pos',
    funcMode: 'gnss',
    catalogGroup: 'gnss',
    action: 'signal',
    title: 'panel.gnss-signals.title',
    description: 'panel.gnss-signals.desc',
    componentName: 'GnssSignal',
    componentPath: '@/components/windows/gnss/GnssSignal.vue',
  },
  {
    id: 'sky-plot',
    moduleId: 'gnss',
    appMode: 'pos',
    funcMode: 'gnss',
    catalogGroup: 'gnss',
    action: 'sky',
    title: 'panel.sky-plot.title',
    description: 'panel.sky-plot.desc',
    componentName: 'GnssSky',
    componentPath: '@/components/windows/gnss/GnssSky.vue',
  },
  {
    id: 'motor-parameters',
    moduleId: 'motor',
    appMode: 'pnc',
    funcMode: 'motor',
    catalogGroup: 'general',
    action: 'config',
    title: 'panel.motor-parameters.title',
    description: 'panel.motor-parameters.desc',
    componentName: 'MotorConfig',
    componentPath: '@/components/windows/motor/MotorConfig.vue',
  },
  {
    id: 'lidar-scene',
    moduleId: 'lidar',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'lidar',
    action: 'radar',
    title: 'panel.lidar-scene.title',
    description: 'panel.lidar-scene.desc',
    componentName: 'LidarScene',
    componentPath: '@/components/windows/lidar/LidarScene.vue',
  },
  {
    id: 'lidar-plot',
    moduleId: 'lidar',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'lidar',
    action: 'lidar-plot',
    title: 'panel.lidar-plot.title',
    description: 'panel.lidar-plot.desc',
    componentName: 'LidarPlot',
    componentPath: '@/components/windows/lidar/LidarPlot.vue',
  },
  {
    id: 'lidar-scores',
    moduleId: 'lidar',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'lidar',
    action: 'lidar-scores',
    title: 'panel.lidar-scores.title',
    description: 'panel.lidar-scores.desc',
    componentName: 'LidarScores',
    componentPath: '@/components/windows/lidar/LidarScores.vue',
  },
  {
    id: 'lidar-inspector',
    moduleId: 'lidar',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'lidar',
    action: 'lidar-inspector',
    title: 'panel.lidar-inspector.title',
    description: 'panel.lidar-inspector.desc',
    componentName: 'LidarInspector',
    componentPath: '@/components/windows/lidar/LidarInspector.vue',
  },
  {
    id: 'gnssraw-frames',
    moduleId: 'gnssraw',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'gnssraw',
    action: 'gnssraw-frames',
    title: 'panel.gnssraw-frames.title',
    description: 'panel.gnssraw-frames.desc',
    componentName: 'GnssRawFrames',
    componentPath: '@/components/windows/gnssraw/GnssRawFrames.vue',
  },
  {
    id: 'gnssraw-visibility',
    moduleId: 'gnssraw',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'gnssraw',
    action: 'gnssraw-visibility',
    title: 'panel.gnssraw-visibility.title',
    description: 'panel.gnssraw-visibility.desc',
    componentName: 'GnssRawVisibility',
    componentPath: '@/components/windows/gnssraw/GnssRawVisibility.vue',
  },
  {
    id: 'gnssraw-gf',
    moduleId: 'gnssraw',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'gnssraw',
    action: 'gnssraw-gf',
    title: 'panel.gnssraw-gf.title',
    description: 'panel.gnssraw-gf.desc',
    componentName: 'GnssRawGf',
    componentPath: '@/components/windows/gnssraw/GnssRawGf.vue',
  },
  {
    id: 'gnssraw-prnoise',
    moduleId: 'gnssraw',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'gnssraw',
    action: 'gnssraw-prnoise',
    title: 'panel.gnssraw-prnoise.title',
    description: 'panel.gnssraw-prnoise.desc',
    componentName: 'GnssRawPrNoise',
    componentPath: '@/components/windows/gnssraw/GnssRawPrNoise.vue',
  },
  {
    id: 'gnssraw-snr',
    moduleId: 'gnssraw',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'gnssraw',
    action: 'gnssraw-snr',
    title: 'panel.gnssraw-snr.title',
    description: 'panel.gnssraw-snr.desc',
    componentName: 'GnssRawSnr',
    componentPath: '@/components/windows/gnssraw/GnssRawSnr.vue',
  },
  {
    id: 'gnssraw-eph',
    moduleId: 'gnssraw',
    appMode: 'workspace',
    funcMode: 'general',
    catalogGroup: 'gnssraw',
    action: 'gnssraw-eph',
    title: 'panel.gnssraw-eph.title',
    description: 'panel.gnssraw-eph.desc',
    componentName: 'GnssRawEph',
    componentPath: '@/components/windows/gnssraw/GnssRawEph.vue',
  },
]

const legacyPanelIds: Readonly<Record<string, string>> = {
  'flow.data': 'plot',
  'motor.data': 'plot',
  'flow.console': 'raw-messages',
  'gnss.console': 'raw-messages',
  'motor.console': 'raw-messages',
  'flow.deviation': 'flow-deviation',
  'gnss.deviation': 'gnss-deviation',
  'gnss.signal': 'gnss-signals',
  'gnss.sky': 'sky-plot',
  'gnss.map': 'gnss-map',
  'motor.config': 'motor-parameters',
}

export function normalizePanelId(id: string): string {
  return legacyPanelIds[id] ?? id
}

export function normalizePanelIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map(normalizePanelId))]
}

export function getPanelById(id: string): PanelDefinition | undefined {
  const normalizedId = normalizePanelId(id)
  return panelRegistry.find((panel) => panel.id === normalizedId)
}

export function getPanelsByIds(ids: readonly string[]): PanelDefinition[] {
  const result: PanelDefinition[] = []
  for (const id of normalizePanelIds(ids)) {
    const panel = panelRegistry.find((entry) => entry.id === id)
    if (panel) result.push(panel)
  }
  return result
}
