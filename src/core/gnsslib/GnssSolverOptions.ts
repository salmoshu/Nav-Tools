import { DEFAULT_RTKPOST_OPTIONS, type RtkPostConstellation, type RtkPostOptions } from './RtkPost'
import { createDefaultRtkNaviSettings, type RtkNaviOptions } from './RtkNavi'

export type SolverOptionsMode = 'post' | 'realtime'
export type SolverOptions = RtkPostOptions | RtkNaviOptions
export type SolverOptionKey =
  | Exclude<keyof RtkPostOptions, 'startTime' | 'endTime'>
  | Exclude<keyof RtkNaviOptions, 'baseConfigPath'>
export type SolverOptionValue =
  string | number | boolean | RtkPostConstellation[] | null | undefined
export const SOLVER_OPTION_CATEGORIES = [
  'common',
  'ambiguity',
  'quality',
  'base',
  'filter',
  'output',
] as const
export type SolverOptionCategory = (typeof SOLVER_OPTION_CATEGORIES)[number]

export interface SolverOptionChoice {
  value: string | number
  label?: string
  labelKey?: string
}

type Condition =
  'relative' | 'phase' | 'ar' | 'glo' | 'gloBias' | 'bds' | 'hold' | 'l2' | 'l5' | 'llh' | 'pos'
export interface SolverOptionField {
  key: SolverOptionKey
  labelKey: string
  configKeys: string[]
  category: SolverOptionCategory
  group: string
  control: 'select' | 'number' | 'switch' | 'systems'
  choices?: SolverOptionChoice[]
  min?: number
  max?: number
  precision?: number
  step?: number
  condition?: Condition
}

const labelKeys: Partial<Record<SolverOptionKey, string>> = {
  mode: 'positioningMode',
  frequency: 'frequency',
  elevationMaskDeg: 'elevationMask',
  intervalS: 'interval',
  baseLatitudeDeg: 'gnssLib.rtknavi.latitude',
  baseLongitudeDeg: 'gnssLib.rtknavi.longitude',
  baseHeightM: 'gnssLib.rtknavi.height',
}
const label = (key: SolverOptionKey) => {
  const name = labelKeys[key] ?? key
  return name.includes('.') ? name : `gnssRaw.rtkpost.${name}`
}
const translated = (value: string | number, name: string): SolverOptionChoice => ({
  value,
  labelKey: `gnssRaw.rtkpost.${name}`,
})
const literal = (value: string | number, text: string): SolverOptionChoice => ({
  value,
  label: text,
})

function select(
  key: SolverOptionKey,
  configKey: string,
  category: SolverOptionCategory,
  group: string,
  choices: SolverOptionChoice[],
  condition?: Condition,
): SolverOptionField {
  return {
    key,
    labelKey: label(key),
    configKeys: [configKey],
    category,
    group,
    control: 'select',
    choices,
    condition,
  }
}
function number(
  key: SolverOptionKey,
  configKey: string,
  category: SolverOptionCategory,
  group: string,
  min: number,
  max: number,
  precision: number,
  step: number,
  condition?: Condition,
): SolverOptionField {
  return {
    key,
    labelKey: label(key),
    configKeys: [configKey],
    category,
    group,
    control: 'number',
    min,
    max,
    precision,
    step,
    condition,
  }
}
function toggle(
  key: SolverOptionKey,
  configKey: string,
  category: SolverOptionCategory,
  group: string,
  condition?: Condition,
): SolverOptionField {
  return {
    key,
    labelKey: label(key),
    configKeys: [configKey],
    category,
    group,
    control: 'switch',
    condition,
  }
}

const commonFields: SolverOptionField[] = [
  select(
    'mode',
    'pos1-posmode',
    'common',
    'processing',
    [
      'modeSingle',
      'modeDgps',
      'modeKinematic',
      'modeStatic',
      'modeStaticStart',
      'modeMovingBase',
      'modeFixed',
      'modePppKinematic',
      'modePppStatic',
      'modePppFixed',
    ].map((name, value) => translated(value, name)),
  ),
  select('frequency', 'pos1-frequency', 'common', 'processing', [
    literal(1, 'L1'),
    literal(2, 'L1 + L2'),
    literal(3, 'L1 + L2 + L5'),
    literal(4, 'L1 + L5'),
  ]),
  number('elevationMaskDeg', 'pos1-elmask', 'common', 'processing', 0, 90, 1, 1),
  select(
    'ambiguityResolution',
    'pos2-armode',
    'common',
    'processing',
    [
      translated('off', 'off'),
      translated('continuous', 'continuous'),
      translated('instantaneous', 'instantaneous'),
      translated('fix-and-hold', 'fixAndHold'),
    ],
    'phase',
  ),
  {
    key: 'constellations',
    labelKey: label('constellations'),
    configKeys: ['pos1-navsys'],
    category: 'common',
    group: 'systems',
    control: 'systems',
  },
]

const postFields: SolverOptionField[] = [
  ...commonFields.slice(0, 3),
  select('solutionType', 'pos1-soltype', 'common', 'processing', [
    translated(0, 'forward'),
    translated(1, 'backward'),
    translated(2, 'combined'),
  ]),
  commonFields[3],
  number('intervalS', 'pos1-tint', 'common', 'processing', 0.000001, 86400, 6, 1),
  commonFields[4],
  number('ratioThreshold', 'pos2-arthres', 'ambiguity', 'fixing', 0, 999, 2, 0.1, 'ar'),
  number('ratioMin', 'pos2-arthresmin', 'ambiguity', 'fixing', 0, 999, 2, 0.1, 'ar'),
  number('ratioMax', 'pos2-arthresmax', 'ambiguity', 'fixing', 0, 999, 2, 0.1, 'ar'),
  number('maxPosVar', 'pos2-arthres1', 'ambiguity', 'fixing', 0, 1000, 4, 0.01, 'ar'),
  number('minLockCount', 'pos2-arlockcnt', 'ambiguity', 'fixing', 0, 10000, 0, 1, 'ar'),
  number('arElevationMaskDeg', 'pos2-arelmask', 'ambiguity', 'fixing', 0, 90, 1, 1, 'ar'),
  number('minFixSats', 'pos2-minfixsats', 'ambiguity', 'fixing', 0, 100, 0, 1, 'ar'),
  number('minDropSats', 'pos2-mindropsats', 'ambiguity', 'fixing', 0, 100, 0, 1, 'ar'),
  number('arResetOutageEpochs', 'pos2-aroutcnt', 'ambiguity', 'fixing', 0, 10000, 0, 1, 'ar'),
  toggle('arFilterEnabled', 'pos2-arfilter', 'ambiguity', 'fixing', 'ar'),
  select(
    'gloArMode',
    'pos2-gloarmode',
    'ambiguity',
    'constellations',
    [
      translated('off', 'off'),
      translated('on', 'on'),
      translated('autocal', 'autoCal'),
      translated('fix-and-hold', 'fixAndHold'),
    ],
    'glo',
  ),
  number(
    'gloHwBiasM',
    'pos2-arthres2',
    'ambiguity',
    'constellations',
    -1000,
    1000,
    4,
    0.01,
    'gloBias',
  ),
  toggle('bdsArEnabled', 'pos2-bdsarmode', 'ambiguity', 'constellations', 'bds'),
  number('minFixCount', 'pos2-arminfix', 'ambiguity', 'holding', 0, 10000, 0, 1, 'hold'),
  number('holdElevationMaskDeg', 'pos2-elmaskhold', 'ambiguity', 'holding', 0, 90, 1, 1, 'hold'),
  number('minHoldSats', 'pos2-minholdsats', 'ambiguity', 'holding', 0, 100, 0, 1, 'hold'),
  number('holdAmbVar', 'pos2-varholdamb', 'ambiguity', 'holding', 0, 1000, 4, 0.01, 'hold'),
  number('holdAmbGain', 'pos2-gainholdamb', 'ambiguity', 'holding', 0, 1000, 4, 0.01, 'hold'),
  {
    ...number(
      'dopplerSlipThresholdHz',
      'pos2-dopthres',
      'quality',
      'detection',
      0,
      1000,
      3,
      0.01,
      'phase',
    ),
    configKeys: ['pos2-dopthres', 'pos2-thresdop'],
  },
  number('gfSlipThresholdM', 'pos2-slipthres', 'quality', 'detection', 0, 1000, 4, 0.01, 'phase'),
  number('maxAgeS', 'pos2-maxage', 'quality', 'detection', 0, 86400, 1, 1, 'relative'),
  number('codeOutlierM', 'pos2-rejcode', 'quality', 'detection', 0, 10000, 2, 1),
  number('phaseOutlierM', 'pos2-rejionno', 'quality', 'detection', 0, 10000, 2, 0.1, 'phase'),
  number('filterIterations', 'pos2-armaxiter', 'quality', 'detection', 1, 100, 0, 1, 'phase'),
  select(
    'basePositionMode',
    'ant2-postype',
    'base',
    'reference',
    [
      literal('llh', 'LLH'),
      literal('xyz', 'XYZ'),
      translated('single', 'baseSingle'),
      translated('posfile', 'baseFile'),
      translated('rinexhead', 'baseRinex'),
      literal('rtcm', 'RTCM'),
      literal('raw', 'Raw'),
    ],
    'relative',
  ),
  toggle('syncSolutionEnabled', 'pos2-syncsol', 'base', 'reference', 'relative'),
  number('baselineLengthM', 'pos2-baselen', 'base', 'constraints', 0, 1000000, 3, 0.1, 'relative'),
  number('baselineSigmaM', 'pos2-basesig', 'base', 'constraints', 0, 10000, 4, 0.01, 'relative'),
  number('errorRatioL1', 'stats-eratio1', 'filter', 'measurement', 0, 10000, 1, 10),
  number('errorRatioL2', 'stats-eratio2', 'filter', 'measurement', 0, 10000, 1, 10, 'l2'),
  number('errorRatioL5', 'stats-eratio5', 'filter', 'measurement', 0, 10000, 1, 10, 'l5'),
  number('phaseErrorM', 'stats-errphase', 'filter', 'measurement', 0, 1000, 4, 0.001),
  number('phaseElevationErrorM', 'stats-errphaseel', 'filter', 'measurement', 0, 1000, 4, 0.001),
  number('phaseBaselineErrorM', 'stats-errphasebl', 'filter', 'measurement', 0, 1000, 4, 0.001),
  number('phaseSnrErrorM', 'stats-errsnr', 'filter', 'measurement', 0, 1000, 4, 0.001),
  number('snrMaxDbHz', 'stats-snrmax', 'filter', 'measurement', 0, 100, 1, 1),
  number('receiverErrorM', 'stats-errrcv', 'filter', 'measurement', 0, 1000, 4, 0.001),
  number('dopplerErrorHz', 'stats-errdoppler', 'filter', 'measurement', 0, 1000, 3, 0.1),
  number('initialBiasStdM', 'stats-stdbias', 'filter', 'initial', 0, 10000, 3, 0.1),
  number('initialIonoStdM', 'stats-stdiono', 'filter', 'initial', 0, 10000, 4, 0.01),
  number('initialTropStdM', 'stats-stdtrop', 'filter', 'initial', 0, 10000, 4, 0.01),
  number('receiverAccelHorizontalMps2', 'stats-prnaccelh', 'filter', 'process', 0, 1000, 2, 0.1),
  number('receiverAccelVerticalMps2', 'stats-prnaccelv', 'filter', 'process', 0, 1000, 2, 0.1),
  number('processBiasM', 'stats-prnbias', 'filter', 'process', 0, 1000, 6, 0.0001),
  number('processIonoM', 'stats-prniono', 'filter', 'process', 0, 1000, 6, 0.0001),
  number('processTropM', 'stats-prntrop', 'filter', 'process', 0, 1000, 6, 0.0001),
  number('clockStabilitySps', 'stats-clkstab', 'filter', 'process', 0, 1, 12, 1e-12),
  select('outputFormat', 'out-solformat', 'output', 'format', [
    literal('llh', 'Lat / Lon / Height'),
    literal('xyz', 'X / Y / Z (ECEF)'),
    literal('enu', 'E / N / U'),
    literal('nmea', 'NMEA-0183 GGA'),
  ]),
  select(
    'timeSystem',
    'out-timesys',
    'output',
    'format',
    [literal('gpst', 'GPST'), literal('utc', 'UTC')],
    'pos',
  ),
  select(
    'timeFormat',
    'out-timeform',
    'output',
    'format',
    [translated('hms', 'calendarTime'), translated('tow', 'timeOfWeek')],
    'pos',
  ),
  number('timeDecimals', 'out-timendec', 'output', 'format', 0, 9, 0, 1, 'pos'),
  select('outputStatus', 'out-outstat', 'output', 'diagnostics', [
    translated(0, 'off'),
    translated(1, 'states'),
    translated(2, 'residuals'),
  ]),
  number('traceLevel', 'out-trace', 'output', 'diagnostics', 0, 5, 0, 1),
]

const realtimeFields: SolverOptionField[] = [
  ...postFields.filter(
    (field) =>
      field.category !== 'output' &&
      !['solutionType', 'intervalS', 'basePositionMode'].includes(field.key),
  ),
  select(
    'basePositionMode',
    'ant2-postype',
    'base',
    'reference',
    [
      translated('rtcm', 'baseRtcm'),
      translated('rinexhead', 'baseRinex'),
      translated('llh', 'baseLlh'),
    ],
    'relative',
  ),
  number('baseLatitudeDeg', 'ant2-pos1', 'base', 'reference', -90, 90, 8, 0.000001, 'llh'),
  number('baseLongitudeDeg', 'ant2-pos2', 'base', 'reference', -180, 180, 8, 0.000001, 'llh'),
  number('baseHeightM', 'ant2-pos3', 'base', 'reference', -Infinity, Infinity, 4, 0.1, 'llh'),
]

const realtimeDefaults = createDefaultRtkNaviSettings().options

export function solverOptionFields(mode: SolverOptionsMode): readonly SolverOptionField[] {
  return mode === 'post' ? postFields : realtimeFields
}

export function solverOptionValue(options: SolverOptions, key: SolverOptionKey): SolverOptionValue {
  return (options as unknown as Partial<Record<SolverOptionKey, SolverOptionValue>>)[key]
}

/** Modified counts describe differences from app defaults, including loaded configuration values. */
export function isSolverOptionModified(
  mode: SolverOptionsMode,
  options: SolverOptions,
  key: SolverOptionKey,
): boolean {
  const defaults = mode === 'post' ? DEFAULT_RTKPOST_OPTIONS : realtimeDefaults
  const value = solverOptionValue(options, key)
  const original = solverOptionValue(defaults, key)
  return Array.isArray(value) && Array.isArray(original)
    ? [...value].sort().join(',') !== [...original].sort().join(',')
    : value !== original
}

/** Return a user-facing reason instead of clearing values when context changes. */
export function solverOptionInactiveReason(
  field: SolverOptionField,
  options: SolverOptions,
): string {
  const prefix = 'gnssRaw.solverOptions.inactive.'
  const relative = options.mode >= 1 && options.mode <= 6
  const phase = options.mode >= 2
  const ar = phase && options.ambiguityResolution !== 'off'
  switch (field.condition) {
    case 'relative':
      return relative ? '' : `${prefix}relative`
    case 'phase':
      return phase ? '' : `${prefix}phase`
    case 'ar':
      return ar ? '' : `${prefix}ar`
    case 'glo':
      return ar && options.constellations.includes('R') ? '' : `${prefix}glo`
    case 'gloBias':
      return ar && options.constellations.includes('R') && options.gloArMode === 'autocal'
        ? ''
        : `${prefix}gloBias`
    case 'bds':
      return ar && options.constellations.includes('C') ? '' : `${prefix}bds`
    case 'hold':
      return ar &&
        (options.ambiguityResolution === 'fix-and-hold' ||
          (options.constellations.includes('R') && options.gloArMode === 'fix-and-hold'))
        ? ''
        : `${prefix}hold`
    case 'l2':
      return options.frequency === 2 || options.frequency === 3 ? '' : `${prefix}l2`
    case 'l5':
      return options.frequency === 3 || options.frequency === 4 ? '' : `${prefix}l5`
    case 'llh':
      return relative && options.basePositionMode === 'llh' ? '' : `${prefix}llh`
    case 'pos':
      return (options as RtkPostOptions).outputFormat !== 'nmea' ? '' : `${prefix}pos`
    default:
      return ''
  }
}
