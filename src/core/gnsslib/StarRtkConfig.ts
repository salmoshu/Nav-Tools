import { parse, stringify } from 'yaml'

export const STAR_RTK_SYSTEMS = ['gps', 'beidou', 'glonass', 'galileo', 'qzss'] as const
export type StarRtkSystem = (typeof STAR_RTK_SYSTEMS)[number]
export type StarRtkAmbiguityMode = 'continuous' | 'instantaneous' | 'fix_and_hold'
export type StarRtkSolutionFormat = 'pos' | 'nmea'
export const STAR_RTK_POSITIONING_MODES = ['spp', 'rtd', 'rtk'] as const
export type StarRtkPositioningMode = (typeof STAR_RTK_POSITIONING_MODES)[number]

export interface StarRtkFixHoldOptions {
  min_fixed_epochs: number
  min_satellites: number
  min_elevation_deg: number
  variance_cycles: number
}

export interface StarRtkRatioOptions {
  adaptive: boolean
  nominal: number
  minimum: number
  maximum: number
}

export interface StarRtkCycleSlipOptions {
  enabled: boolean
  use_lock_flags: boolean
}

export interface StarRtkMotionPriorOptions {
  enabled: boolean
}

export interface StarRtkFloatHoldOptions {
  enabled: boolean
  max_duration_s: number
}

export interface StarRtkResidualGateOptions {
  enabled: boolean
  phase_sigma: number
  code_sigma: number
}

export interface StarRtkArRetryOptions {
  enabled: boolean
  max_trials: number
  max_correction_m: number
  max_spp_deviation_m: number
  validate_candidates: boolean
}

export interface StarRtkDgnssOptions {
  enabled: boolean
  max_float_rms_m: number
  max_dgnss_rms_m: number
  min_satellites: number
}

const DEFAULT_SPP_FILTER = {
  enabled: false,
  acceleration_noise_mps2: 0.5,
  min_position_sigma_m: 1.5,
  min_velocity_sigma_mps: 0.15,
  innovation_sigma: 4,
  max_gap_s: 10,
}

export const STAR_RTK_SNR_LIMIT = { min: 0, max: 100, defaultValue: 30 } as const

export const STAR_RTK_SPP_FILTER_FIELDS = [
  { key: 'acceleration_noise_mps2', min: 0.001, max: 100, step: 0.1 },
  { key: 'min_position_sigma_m', min: 0.01, max: 1000, step: 0.1 },
  { key: 'min_velocity_sigma_mps', min: 0.001, max: 100, step: 0.05 },
  { key: 'innovation_sigma', min: 0.1, max: 100, step: 0.5 },
  { key: 'max_gap_s', min: 0.001, max: 120, step: 1 },
] as const

export const STAR_RTK_SWITCHES = [
  'base_static',
  'rover_static',
  'single_epoch',
  'combine_frequencies',
  'widelane_assist',
  'partial_ambiguity',
  'degraded_guard',
] as const

export interface StarRtkProcessingOptions {
  positioning_mode: StarRtkPositioningMode
  base_static: boolean
  rover_static: boolean
  single_epoch: boolean
  combine_frequencies: boolean
  widelane_assist: boolean
  weighting: 'elevation' | 'signal_strength'
  min_snr_dbhz: number
  ambiguity_mode: StarRtkAmbiguityMode
  partial_ambiguity: boolean
  degraded_guard: boolean
  fix_hold: StarRtkFixHoldOptions
  ratio: StarRtkRatioOptions
  cycle_slip: StarRtkCycleSlipOptions
  motion_prior: StarRtkMotionPriorOptions
  float_hold: StarRtkFloatHoldOptions
  residual_gate: StarRtkResidualGateOptions
  ar_retry: StarRtkArRetryOptions
  dgnss: StarRtkDgnssOptions
  spp_filter: typeof DEFAULT_SPP_FILTER
  frequencies: Record<StarRtkSystem, [boolean, boolean, boolean]>
  trace_directory: string
}

export const STAR_RTK_PROCESSING_GROUPS = {
  positioning: ['positioning_mode', 'base_static', 'rover_static', 'single_epoch'],
  observations: [
    'frequencies',
    'weighting',
    'min_snr_dbhz',
    'combine_frequencies',
    'widelane_assist',
  ],
  ambiguity: ['ambiguity_mode', 'partial_ambiguity', 'fix_hold', 'ratio', 'ar_retry'],
  quality_control: ['cycle_slip', 'residual_gate', 'degraded_guard', 'dgnss'],
  filtering: ['spp_filter', 'motion_prior', 'float_hold'],
  output: ['trace_directory'],
} as const satisfies Record<string, readonly (keyof StarRtkProcessingOptions)[]>
export type StarRtkProcessingGroup = keyof typeof STAR_RTK_PROCESSING_GROUPS
export type StarRtkConfigLayout = 'flat' | 'grouped'

const processingYamlKeys = [
  ...Object.keys(STAR_RTK_PROCESSING_GROUPS),
  ...Object.values(STAR_RTK_PROCESSING_GROUPS).flat(),
]

export interface StarRtkTimingOptions {
  cycle_ms: number
  max_base_age_s: number
}

export interface StarRtkStream {
  type: string
  path: string
}

type StarRtkSolutionOutput = { solution_file?: string; solution_format?: StarRtkSolutionFormat }

export interface StarRtkConfiguration {
  processing: StarRtkProcessingOptions
  post?: StarRtkSolutionOutput & {
    base_observations?: string
    rover_observations?: string
    navigation?: string
  }
  realtime?: StarRtkTimingOptions &
    StarRtkSolutionOutput & { rover?: StarRtkStream; base?: StarRtkStream }
}

export function defaultStarRtkProcessing(): StarRtkProcessingOptions {
  return {
    positioning_mode: 'rtk',
    base_static: true,
    rover_static: false,
    single_epoch: false,
    combine_frequencies: false,
    widelane_assist: false,
    weighting: 'elevation',
    min_snr_dbhz: STAR_RTK_SNR_LIMIT.defaultValue,
    ambiguity_mode: 'fix_and_hold',
    partial_ambiguity: true,
    degraded_guard: false,
    fix_hold: {
      min_fixed_epochs: 1,
      min_satellites: 5,
      min_elevation_deg: 15,
      variance_cycles: 0.00000001,
    },
    ratio: {
      adaptive: false,
      nominal: 3,
      minimum: 1.3,
      maximum: 3,
    },
    cycle_slip: {
      enabled: false,
      use_lock_flags: true,
    },
    motion_prior: {
      enabled: false,
    },
    float_hold: {
      enabled: true,
      max_duration_s: 5,
    },
    residual_gate: {
      enabled: false,
      phase_sigma: 5,
      code_sigma: 4,
    },
    ar_retry: {
      enabled: false,
      max_trials: 4,
      max_correction_m: 1,
      max_spp_deviation_m: 5,
      validate_candidates: false,
    },
    dgnss: {
      enabled: false,
      max_float_rms_m: 0.3,
      max_dgnss_rms_m: 5,
      min_satellites: 5,
    },
    spp_filter: { ...DEFAULT_SPP_FILTER },
    frequencies: {
      gps: [true, false, false],
      beidou: [true, false, false],
      glonass: [false, false, false],
      galileo: [true, false, false],
      qzss: [true, false, false],
    },
    trace_directory: '',
  }
}

export function starRtkProcessing(value?: unknown): StarRtkProcessingOptions {
  const options = defaultStarRtkProcessing()
  const input = processingFields(value)
  options.positioning_mode = starRtkPositioningMode(input.positioning_mode)
  for (const key of STAR_RTK_SWITCHES) {
    const selected = input[key]
    if (selected === undefined) continue
    if (typeof selected !== 'boolean') throw new Error(`processing.${key} 必须是布尔值`)
    options[key] = selected
  }
  if (input.weighting !== undefined) {
    if (input.weighting !== 'elevation' && input.weighting !== 'signal_strength') {
      throw new Error('processing.weighting 必须是 elevation 或 signal_strength')
    }
    options.weighting = input.weighting
  }
  if (input.min_snr_dbhz !== undefined) {
    const key = 'processing.min_snr_dbhz'
    const value = numberOption(input.min_snr_dbhz, key)
    const { min, max } = STAR_RTK_SNR_LIMIT
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${key} 必须是 ${min}–${max} 的整数`)
    }
    options.min_snr_dbhz = value
  }
  if (input.ambiguity_mode !== undefined) {
    const mode = input.ambiguity_mode === 'fix-and-hold' ? 'fix_and_hold' : input.ambiguity_mode
    if (mode !== 'continuous' && mode !== 'instantaneous' && mode !== 'fix_and_hold') {
      throw new Error('processing.ambiguity_mode 必须是 continuous、instantaneous 或 fix_and_hold')
    }
    options.ambiguity_mode = mode
  }
  const fixHold = mapping(input.fix_hold, 'processing.fix_hold', Object.keys(options.fix_hold))
  for (const key of Object.keys(options.fix_hold) as (keyof StarRtkFixHoldOptions)[]) {
    if (fixHold[key] !== undefined) {
      options.fix_hold[key] = numberOption(fixHold[key], `processing.fix_hold.${key}`)
    }
  }
  if (
    !Number.isInteger(options.fix_hold.min_fixed_epochs) ||
    options.fix_hold.min_fixed_epochs < 1 ||
    !Number.isInteger(options.fix_hold.min_satellites) ||
    options.fix_hold.min_satellites < 3 ||
    options.fix_hold.min_elevation_deg < 0 ||
    options.fix_hold.min_elevation_deg > 90 ||
    options.fix_hold.variance_cycles <= 0
  ) {
    throw new Error('processing.fix_hold 包含无效的历元数、卫星数、高度角或方差')
  }

  const ratio = mapping(input.ratio, 'processing.ratio', Object.keys(options.ratio))
  if (ratio.adaptive !== undefined) {
    if (typeof ratio.adaptive !== 'boolean') {
      throw new Error('processing.ratio.adaptive 必须是布尔值')
    }
    options.ratio.adaptive = ratio.adaptive
  }
  for (const key of ['nominal', 'minimum', 'maximum'] as const) {
    if (ratio[key] !== undefined) {
      options.ratio[key] = numberOption(ratio[key], `processing.ratio.${key}`)
    }
  }
  if (
    options.ratio.nominal <= 1 ||
    options.ratio.minimum < 1 ||
    options.ratio.minimum > options.ratio.nominal ||
    options.ratio.nominal > options.ratio.maximum
  ) {
    throw new Error('processing.ratio 必须满足 1<=minimum<=nominal<=maximum 且 nominal>1')
  }

  readAdvancedOptions(input, options)

  const frequencies = mapping(input.frequencies, 'processing.frequencies', STAR_RTK_SYSTEMS)
  for (const system of STAR_RTK_SYSTEMS) {
    const row = frequencies[system]
    if (row === undefined) continue
    if (!Array.isArray(row) || row.length !== 3 || row.some((item) => typeof item !== 'boolean')) {
      throw new Error(`processing.frequencies.${system} 必须包含三个布尔值`)
    }
    options.frequencies[system] = [row[0], row[1], row[2]]
  }
  if (frequencies.qzss === undefined) {
    options.frequencies.qzss = [...options.frequencies.gps]
  }
  const primaryOnly = options.positioning_mode !== 'rtk'
  if (
    !STAR_RTK_SYSTEMS.some((system) =>
      primaryOnly ? options.frequencies[system][0] : options.frequencies[system].some(Boolean),
    )
  ) {
    throw new Error(
      primaryOnly ? 'StarRTK SPP 和 RTD 至少需要一个主频' : 'StarRTK 至少需要启用一个频点',
    )
  }
  options.trace_directory =
    optionalString(input.trace_directory, 'processing.trace_directory') ?? ''
  return options
}

export function starRtkTiming(value?: Partial<StarRtkTimingOptions>): StarRtkTimingOptions {
  const cycle_ms = value?.cycle_ms ?? 100
  const max_base_age_s = value?.max_base_age_s ?? 1
  if (!Number.isInteger(cycle_ms) || cycle_ms < 1 || cycle_ms > 1000) {
    throw new Error('realtime.cycle_ms 必须是 1–1000 的整数')
  }
  if (!Number.isFinite(max_base_age_s) || max_base_age_s < 0 || max_base_age_s > 120) {
    throw new Error('realtime.max_base_age_s 必须在 0–120 秒之间')
  }
  return { cycle_ms, max_base_age_s }
}

export function restoreStarRtkProcessing(value: unknown): StarRtkProcessingOptions {
  try {
    return starRtkProcessing(value)
  } catch {
    return defaultStarRtkProcessing()
  }
}

export function parseStarRtkConfig(text: string): StarRtkConfiguration {
  const root = mapping(parse(text, { maxAliasCount: 32 }), 'StarRTK', [
    'processing',
    'post',
    'realtime',
  ])
  const config: StarRtkConfiguration = { processing: starRtkProcessing(root.processing) }
  if (root.post !== undefined) {
    const keys = ['base_observations', 'rover_observations', 'navigation', 'solution_file'] as const
    const input = mapping(root.post, 'post', [...keys, 'solution_format'])
    config.post = {}
    for (const key of keys) config.post[key] = optionalString(input[key], `post.${key}`)
    config.post.solution_format = starRtkSolutionFormat(input.solution_format)
  }
  if (root.realtime !== undefined) {
    const input = mapping(root.realtime, 'realtime', [
      'rover',
      'base',
      'solution_file',
      'solution_format',
      'cycle_ms',
      'max_base_age_s',
    ])
    config.realtime = {
      ...starRtkTiming({
        cycle_ms: input.cycle_ms as number | undefined,
        max_base_age_s: input.max_base_age_s as number | undefined,
      }),
      rover: parseStream(input.rover, 'realtime.rover'),
      base: parseStream(input.base, 'realtime.base'),
      solution_file: optionalString(input.solution_file, 'realtime.solution_file'),
      solution_format: starRtkSolutionFormat(input.solution_format),
    }
  }
  return config
}

export function starRtkSolutionFormat(value: unknown): StarRtkSolutionFormat | undefined {
  if (value === undefined || value === 'pos' || value === 'nmea') return value
  throw new Error('solution_format 必须是 pos 或 nmea')
}

function starRtkPositioningMode(value: unknown): StarRtkPositioningMode {
  if (value === undefined) return 'rtk'
  const mode = typeof value === 'string' ? value.toLowerCase() : value
  if (mode === 'spp' || mode === 'rtd' || mode === 'rtk') return mode
  throw new Error('processing.positioning_mode 必须是 spp、rtd 或 rtk')
}

export function starRtkRequiresBase(
  processing?: Pick<StarRtkProcessingOptions, 'positioning_mode'>,
): boolean {
  return starRtkPositioningMode(processing?.positioning_mode) !== 'spp'
}

function processingFields(value: unknown): Record<string, unknown> {
  const source = mapping(value, 'processing', processingYamlKeys)
  const fields: Record<string, unknown> = {}
  const addField = (key: string, option: unknown) => {
    if (Object.hasOwn(fields, key)) throw new Error(`processing 重复配置了 ${key}`)
    fields[key] = option
  }
  for (const [key, entry] of Object.entries(source)) {
    if (Object.hasOwn(STAR_RTK_PROCESSING_GROUPS, key)) {
      const keys = STAR_RTK_PROCESSING_GROUPS[key as StarRtkProcessingGroup]
      const group = mapping(entry, `processing.${key}`, keys)
      for (const [name, option] of Object.entries(group)) addField(name, option)
    } else {
      addField(key, entry)
    }
  }
  return fields
}

export function stringifyStarRtkConfig(
  config: StarRtkConfiguration,
  layout: StarRtkConfigLayout = 'flat',
): string {
  if (layout === 'grouped') {
    const groups = Object.fromEntries(
      Object.entries(STAR_RTK_PROCESSING_GROUPS).map(([name, keys]) => [
        name,
        Object.fromEntries(keys.map((key) => [key, config.processing[key]])),
      ]),
    )
    return stringify({ ...config, processing: groups }, { lineWidth: 0 })
  }

  const { frequencies, min_snr_dbhz, positioning_mode, spp_filter, ...processing } =
    config.processing
  const { qzss, ...legacyFrequencies } = frequencies
  const inheritsGps = qzss.every((enabled, slot) => enabled === frequencies.gps[slot])
  const hasSppFilterSettings =
    spp_filter.enabled ||
    STAR_RTK_SPP_FILTER_FIELDS.some(({ key }) => spp_filter[key] !== DEFAULT_SPP_FILTER[key])
  // Omit newer settings when their defaults have the same meaning for older executables.
  return stringify(
    {
      ...config,
      processing: {
        ...processing,
        ...(positioning_mode === 'rtk' ? {} : { positioning_mode }),
        ...(min_snr_dbhz === STAR_RTK_SNR_LIMIT.defaultValue ? {} : { min_snr_dbhz }),
        ...(hasSppFilterSettings ? { spp_filter } : {}),
        frequencies: inheritsGps ? legacyFrequencies : frequencies,
      },
    },
    { lineWidth: 0 },
  )
}

export function isStarRtkExecutable(path: string): boolean {
  const name = path.trim().split(/[\\/]/).pop() ?? ''
  return /^starrtk(?:[-_][^\\/]*)?(?:\.exe)?$/i.test(name)
}

function readAdvancedOptions(
  input: Record<string, unknown>,
  options: StarRtkProcessingOptions,
): void {
  const cycleSlip = mapping(input.cycle_slip, 'processing.cycle_slip', [
    'enabled',
    'use_lock_flags',
  ])
  for (const key of ['enabled', 'use_lock_flags'] as const) {
    if (cycleSlip[key] !== undefined) {
      options.cycle_slip[key] = booleanOption(cycleSlip[key], `processing.cycle_slip.${key}`)
    }
  }

  const motionPrior = mapping(input.motion_prior, 'processing.motion_prior', ['enabled'])
  if (motionPrior.enabled !== undefined) {
    options.motion_prior.enabled = booleanOption(
      motionPrior.enabled,
      'processing.motion_prior.enabled',
    )
  }

  const floatHold = mapping(input.float_hold, 'processing.float_hold', [
    'enabled',
    'max_duration_s',
  ])
  if (floatHold.enabled !== undefined) {
    options.float_hold.enabled = booleanOption(floatHold.enabled, 'processing.float_hold.enabled')
  }
  if (floatHold.max_duration_s !== undefined) {
    options.float_hold.max_duration_s = numberOption(
      floatHold.max_duration_s,
      'processing.float_hold.max_duration_s',
    )
  }
  if (options.float_hold.max_duration_s <= 0 || options.float_hold.max_duration_s > 60) {
    throw new Error('processing.float_hold.max_duration_s 必须在 (0, 60] 秒之间')
  }

  const residualGate = mapping(input.residual_gate, 'processing.residual_gate', [
    'enabled',
    'phase_sigma',
    'code_sigma',
  ])
  if (residualGate.enabled !== undefined) {
    options.residual_gate.enabled = booleanOption(
      residualGate.enabled,
      'processing.residual_gate.enabled',
    )
  }
  for (const key of ['phase_sigma', 'code_sigma'] as const) {
    if (residualGate[key] !== undefined) {
      options.residual_gate[key] = numberOption(
        residualGate[key],
        `processing.residual_gate.${key}`,
      )
    }
  }
  if (options.residual_gate.phase_sigma <= 0 || options.residual_gate.code_sigma <= 0) {
    throw new Error('processing.residual_gate 的相位和伪距门限必须大于零')
  }

  const arRetry = mapping(input.ar_retry, 'processing.ar_retry', [
    'enabled',
    'max_trials',
    'max_correction_m',
    'max_spp_deviation_m',
    'validate_candidates',
  ])
  for (const key of ['enabled', 'validate_candidates'] as const) {
    if (arRetry[key] !== undefined) {
      options.ar_retry[key] = booleanOption(arRetry[key], `processing.ar_retry.${key}`)
    }
  }
  for (const key of ['max_trials', 'max_correction_m', 'max_spp_deviation_m'] as const) {
    if (arRetry[key] !== undefined) {
      options.ar_retry[key] = numberOption(arRetry[key], `processing.ar_retry.${key}`)
    }
  }
  if (
    !Number.isInteger(options.ar_retry.max_trials) ||
    options.ar_retry.max_trials < 1 ||
    options.ar_retry.max_trials > 64 ||
    options.ar_retry.max_correction_m <= 0 ||
    options.ar_retry.max_spp_deviation_m <= 0
  ) {
    throw new Error('processing.ar_retry 包含无效的重试次数或位置门限')
  }

  const dgnss = mapping(input.dgnss, 'processing.dgnss', [
    'enabled',
    'max_float_rms_m',
    'max_dgnss_rms_m',
    'min_satellites',
  ])
  if (dgnss.enabled !== undefined) {
    options.dgnss.enabled = booleanOption(dgnss.enabled, 'processing.dgnss.enabled')
  }
  for (const key of ['max_float_rms_m', 'max_dgnss_rms_m', 'min_satellites'] as const) {
    if (dgnss[key] !== undefined) {
      options.dgnss[key] = numberOption(dgnss[key], `processing.dgnss.${key}`)
    }
  }
  if (
    options.dgnss.max_float_rms_m <= 0 ||
    options.dgnss.max_float_rms_m > 20 ||
    options.dgnss.max_dgnss_rms_m <= 0 ||
    options.dgnss.max_dgnss_rms_m > 100
  ) {
    throw new Error('processing.dgnss RMS 门限必须大于零且不超过 20/100 米')
  }
  if (
    !Number.isInteger(options.dgnss.min_satellites) ||
    options.dgnss.min_satellites < 5 ||
    options.dgnss.min_satellites > 64
  ) {
    throw new Error('processing.dgnss.min_satellites 必须是 5–64 的整数')
  }

  const filter = mapping(input.spp_filter, 'processing.spp_filter', Object.keys(DEFAULT_SPP_FILTER))
  if (filter.enabled !== undefined) {
    options.spp_filter.enabled = booleanOption(filter.enabled, 'processing.spp_filter.enabled')
  }
  for (const { key, min, max } of STAR_RTK_SPP_FILTER_FIELDS) {
    if (filter[key] === undefined) continue
    const name = `processing.spp_filter.${key}`
    const value = numberOption(filter[key], name)
    if (value < min || value > max) throw new Error(`${name} 必须在 [${min}, ${max}] 范围内`)
    options.spp_filter[key] = value
  }
}

function mapping(value: unknown, name: string, keys: readonly string[]): Record<string, unknown> {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} 必须是 YAML 映射`)
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`${name} 包含未知键 ${key}`)
  }
  return value as Record<string, unknown>
}

function booleanOption(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} 必须是布尔值`)
  return value
}

function numberOption(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} 必须是有限数值`)
  }
  return value
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.includes('\0')) throw new Error(`${name} 必须是文本`)
  return value
}

function parseStream(value: unknown, name: string): StarRtkStream | undefined {
  if (value === undefined) return undefined
  const input = mapping(value, name, ['type', 'path'])
  const type = optionalString(input.type, `${name}.type`)
  const path = optionalString(input.path, `${name}.path`)
  if (!type || !path) throw new Error(`${name} 需要 type 和 path`)
  return { type, path }
}
