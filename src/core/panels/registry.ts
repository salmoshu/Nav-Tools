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
export type PanelDataMode = 'general' | 'flow' | 'gnss' | 'motor'
export type PanelCatalogGroup = 'general' | 'flow' | 'gnss' | 'motor' | 'camera'

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
    id: 'flow-deviation-canvas',
    moduleId: 'flow',
    appMode: 'robot',
    funcMode: 'flow',
    catalogGroup: 'general',
    action: 'deviation',
    title: 'panel.flow-deviation-canvas.title',
    description: 'panel.flow-deviation-canvas.desc',
    componentName: 'FlowDeviationCanvas',
    componentPath: '@/components/windows/common/FlowDeviationCanvas.vue',
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
    id: 'gnss-deviation-canvas',
    moduleId: 'gnss',
    appMode: 'pos',
    funcMode: 'gnss',
    catalogGroup: 'gnss',
    action: 'deviation',
    title: 'panel.gnss-deviation-canvas.title',
    description: 'panel.gnss-deviation-canvas.desc',
    componentName: 'GnssDeviationCanvas',
    componentPath: '@/components/windows/gnss/GnssDeviationCanvas.vue',
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
    catalogGroup: 'motor',
    action: 'config',
    title: 'panel.motor-parameters.title',
    description: 'panel.motor-parameters.desc',
    componentName: 'MotorConfig',
    componentPath: '@/components/windows/motor/MotorConfig.vue',
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
