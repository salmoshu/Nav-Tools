import { DETECTABLE_FORMATS, type DataFormat, type DetectableFormat } from '@/core/data/DataFormat'

export type PanelDataPipeline = 'raw' | 'records' | 'gnss' | 'gnssraw' | 'lidar'

export interface PanelDataContract {
  role: 'consumer' | 'excluded'
  pipeline?: PanelDataPipeline
  formats?: readonly DataFormat[]
}

const ALL_FORMATS: readonly DataFormat[] = ['raw', 'regex', ...DETECTABLE_FORMATS]
const GNSS_FORMATS: readonly DataFormat[] = ['nmea', 'rtklib-pos']
const RECORD_FORMATS: readonly DataFormat[] = ['json', 'csv', 'regex']
const GNSSRAW_FORMATS: readonly DataFormat[] = ['rtcm3', 'rinex']

function consumer(pipeline: PanelDataPipeline, formats: readonly DataFormat[]): PanelDataContract {
  return { role: 'consumer', pipeline, formats }
}

export const PANEL_DATA_CONTRACTS: Readonly<Record<string, PanelDataContract>> = {
  plot: consumer('records', RECORD_FORMATS),
  'raw-messages': consumer('raw', ALL_FORMATS),
  'flow-deviation': consumer('records', RECORD_FORMATS),
  'gnss-deviation': consumer('gnss', GNSS_FORMATS),
  'gnss-signals': consumer('gnss', GNSS_FORMATS),
  'sky-plot': consumer('gnss', ['nmea']),
  'gnssraw-frames': consumer('gnssraw', GNSSRAW_FORMATS),
  'gnssraw-visibility': consumer('gnssraw', GNSSRAW_FORMATS),
  'gnssraw-gf': consumer('gnssraw', GNSSRAW_FORMATS),
  'gnssraw-prnoise': consumer('gnssraw', GNSSRAW_FORMATS),
  'gnssraw-snr': consumer('gnssraw', GNSSRAW_FORMATS),
  'gnssraw-eph': consumer('gnssraw', GNSSRAW_FORMATS),
  'lidar-scene': consumer('lidar', ['mcap']),
  'lidar-plot': consumer('lidar', ['mcap']),
  'lidar-scores': consumer('lidar', ['mcap']),
  'lidar-inspector': consumer('lidar', ['mcap']),
  terminal: { role: 'excluded' },
  'camera-video': { role: 'excluded' },
  'camera-parameters': { role: 'excluded' },
  'motor-parameters': { role: 'excluded' },
  'gnsslib-solver': { role: 'excluded' },
}

export const SOLVER_SCOPED_PANEL_IDS = new Set([
  'gnsslib-solver',
  'raw-messages',
  'gnss-deviation',
  'gnss-signals',
])

export function panelDataContract(windowId: string): PanelDataContract {
  return PANEL_DATA_CONTRACTS[windowId] ?? { role: 'excluded' }
}

export function defaultFormatsForPanels(windowIds: readonly string[]): DetectableFormat[] {
  const formats = new Set<DetectableFormat>()
  const pipelines = new Set(
    windowIds.flatMap((id) => {
      const contract = panelDataContract(id)
      return contract.role === 'consumer' && contract.pipeline ? [contract.pipeline] : []
    }),
  )
  if (pipelines.has('raw') || pipelines.size === 0) {
    for (const format of ['nmea', 'rtklib-pos', 'json', 'csv'] as const) formats.add(format)
  }
  if (pipelines.has('records')) {
    formats.add('json')
    formats.add('csv')
  }
  if (pipelines.has('gnss')) {
    formats.add('nmea')
    formats.add('rtklib-pos')
  }
  if (pipelines.has('gnssraw')) {
    formats.add('rtcm3')
    formats.add('rinex')
  }
  if (pipelines.has('lidar')) formats.add('mcap')
  return DETECTABLE_FORMATS.filter((format) => formats.has(format))
}
