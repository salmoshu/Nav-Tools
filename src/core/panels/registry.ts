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
    title: 'Plot',
    description: '绘制数值数据随时间的变化',
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
    title: 'Raw Messages',
    description: '查看、筛选并发送原始消息',
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
    title: 'Camera Video',
    description: '播放 RTSP 相机实时视频画面',
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
    title: 'Camera Parameters',
    description: '读取和配置相机参数及显示模式',
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
    title: 'Flow Deviation',
    description: '分析 Flow 轨迹与偏差',
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
    title: 'Flow Deviation Canvas',
    description: '分析 Flow 轨迹与偏差（ECharts 版，用于性能对比与回退）',
    componentName: 'FlowDeviationCanvas',
    componentPath: '@/components/windows/common/FlowDeviationCanvas.vue',
  },
  {
    id: 'gnss-deviation',
    moduleId: 'gnss',
    appMode: 'pos',
    funcMode: 'gnss',
    catalogGroup: 'gnss',
    action: 'deviation',
    title: 'GNSS Deviation',
    description: '分析 GNSS 定位偏差',
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
    title: 'GNSS Deviation Canvas',
    description: '分析 GNSS 定位偏差（ECharts 版，用于性能对比与回退）',
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
    title: 'GNSS Signals',
    description: '查看卫星信号强度与状态',
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
    title: 'Sky Plot',
    description: '查看卫星方位角与高度角',
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
    title: 'Motor Parameters',
    description: '读取和配置电机参数',
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
  const requestedIds = new Set(normalizePanelIds(ids))
  return panelRegistry.filter((panel) => requestedIds.has(panel.id))
}
