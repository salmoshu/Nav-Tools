import { createApp, defineComponent, h, nextTick, reactive, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse as parseYaml } from 'yaml'
import StarRtkOptions from '../../src/components/windows/gnsslib/StarRtkOptions.vue'
import {
  defaultStarRtkProcessing,
  isStarRtkExecutable,
  parseStarRtkConfig,
  starRtkProcessing,
  stringifyStarRtkConfig,
} from '../../src/core/gnsslib/StarRtkConfig'

vi.mock('element-plus', () => ({
  ElMessage: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

const InputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  setup(props) {
    return () => h('input', { value: props.modelValue })
  },
})
const ButtonStub = defineComponent({
  setup(_, { slots }) {
    return () => h('button', { type: 'button' }, slots.default?.())
  },
})
const PassthroughStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

let mounted: { app: App; host: HTMLDivElement } | undefined
const originalElectronApi = Object.getOwnPropertyDescriptor(window, 'electronAPI')

afterEach(() => {
  mounted?.app.unmount()
  mounted?.host.remove()
  mounted = undefined
  if (originalElectronApi) Object.defineProperty(window, 'electronAPI', originalElectronApi)
  else Reflect.deleteProperty(window, 'electronAPI')
})

describe('StarRtkOptions diagnostics directory', () => {
  it('opens the desktop directory picker and fills the selected directory', async () => {
    const selected = 'C:\\Users\\Salmos\\Desktop\\金枫园区数据\\rinex\\starlog'
    const choose = vi.fn().mockResolvedValue(selected)
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { starRtkChooseDirectory: choose },
    })
    const processing = defaultStarRtkProcessing()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(StarRtkOptions, {
      modelValue: processing,
      disabled: false,
      applyConfig: () => undefined,
      exportConfig: () => ({ defaultPath: 'starrtk.yaml', content: '', protectedPaths: [] }),
    })
    app.component('ElInput', InputStub)
    app.component('ElInputNumber', InputStub)
    app.component('ElButton', ButtonStub)
    for (const name of ['ElIcon', 'ElSelect', 'ElOption', 'ElSwitch', 'ElCheckbox']) {
      app.component(name, PassthroughStub)
    }
    app.mount(host)
    mounted = { app, host }
    host.querySelector<HTMLButtonElement>('[data-category="output"]')!.click()
    await nextTick()

    const button = host.querySelector<HTMLButtonElement>(
      '[data-testid="starrtk-choose-trace-directory"]',
    )
    expect(button).not.toBeNull()
    button!.click()

    await vi.waitFor(() => expect(processing.trace_directory).toBe(selected))
    expect(choose).toHaveBeenCalledOnce()
    expect(
      host.querySelector<HTMLInputElement>('[data-testid="starrtk-trace-directory"]')?.value,
    ).toBe(selected)
  })
})

describe('StarRTK ambiguity configuration', () => {
  it('uses the compatible Fix-and-Hold and PAR defaults', () => {
    const options = defaultStarRtkProcessing()
    expect(options.ambiguity_mode).toBe('fix_and_hold')
    expect(options.partial_ambiguity).toBe(true)
    expect(options.fix_hold).toEqual({
      min_fixed_epochs: 1,
      min_satellites: 5,
      min_elevation_deg: 15,
      variance_cycles: 0.00000001,
    })
    expect(options.ratio).toEqual({ adaptive: false, nominal: 3, minimum: 1.3, maximum: 3 })
  })

  it('round-trips ambiguity, hold and ratio settings through YAML', () => {
    const config = parseStarRtkConfig(`
processing:
  ambiguity_mode: continuous
  partial_ambiguity: false
  fix_hold:
    min_fixed_epochs: 8
    min_satellites: 6
    min_elevation_deg: 20
    variance_cycles: 0.001
  ratio:
    adaptive: true
    nominal: 2.8
    minimum: 1.4
    maximum: 3.2
`)
    expect(config.processing.ambiguity_mode).toBe('continuous')
    expect(config.processing.partial_ambiguity).toBe(false)
    expect(config.processing.fix_hold).toMatchObject({
      min_fixed_epochs: 8,
      min_satellites: 6,
      min_elevation_deg: 20,
      variance_cycles: 0.001,
    })
    expect(config.processing.ratio).toEqual({
      adaptive: true,
      nominal: 2.8,
      minimum: 1.4,
      maximum: 3.2,
    })
    const output = stringifyStarRtkConfig(config)
    expect(output).toContain('ambiguity_mode: continuous')
    expect(output).toContain('min_fixed_epochs: 8')
    expect(output).toContain('adaptive: true')
    expect(parseStarRtkConfig(output)).toEqual(config)
  })

  it('normalizes the Open-GNSS fix-and-hold spelling', () => {
    expect(
      parseStarRtkConfig('processing:\n  ambiguity_mode: fix-and-hold\n').processing.ambiguity_mode,
    ).toBe('fix_and_hold')
  })

  it('rejects invalid modes, hold limits and ratio ordering', () => {
    expect(() => starRtkProcessing({ ambiguity_mode: 'unknown' })).toThrow('ambiguity_mode')
    expect(() => starRtkProcessing({ fix_hold: { min_fixed_epochs: 0 } })).toThrow('fix_hold')
    expect(() => starRtkProcessing({ fix_hold: { min_satellites: 2 } })).toThrow('fix_hold')
    expect(() => starRtkProcessing({ fix_hold: { variance_cycles: 0 } })).toThrow('fix_hold')
    expect(() => starRtkProcessing({ ratio: { minimum: 4 } })).toThrow('ratio')
    expect(() => starRtkProcessing({ ratio: { adaptive: 'yes' } })).toThrow('adaptive')
  })
})

describe('StarRtkOptions ambiguity controls', () => {
  it('shows hold fields only in Fix-and-Hold mode and exposes PAR and ratio controls', async () => {
    const processing = reactive(defaultStarRtkProcessing())
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(StarRtkOptions, {
      modelValue: processing,
      disabled: false,
      applyConfig: () => undefined,
      exportConfig: () => ({ defaultPath: 'starrtk.yaml', content: '', protectedPaths: [] }),
    })
    app.component('ElInput', InputStub)
    app.component('ElInputNumber', InputStub)
    app.component('ElButton', ButtonStub)
    for (const name of ['ElIcon', 'ElSelect', 'ElOption', 'ElSwitch', 'ElCheckbox']) {
      app.component(name, PassthroughStub)
    }
    app.mount(host)
    mounted = { app, host }
    const category = async (name: string) => {
      host.querySelector<HTMLButtonElement>(`[data-category="${name}"]`)!.click()
      await nextTick()
    }
    expect(host.querySelector('[data-testid="starrtk-positioning-mode"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-partial_ambiguity"]')).toBeNull()
    await category('observations')
    expect(host.querySelector('[data-testid="starrtk-widelane_assist"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-min-snr"]')).not.toBeNull()

    await category('ambiguity')
    expect(host.querySelector('[data-testid="starrtk-partial_ambiguity"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-ambiguity-mode"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-adaptive-ratio"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-min-fixed-epochs"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-variance-cycles"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-ar-retry"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-ar-retry-max-trials"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-ar-retry-validate"]')).not.toBeNull()

    processing.ambiguity_mode = 'continuous'
    await nextTick()
    expect(host.querySelector('[data-testid="starrtk-min-fixed-epochs"]')).toBeNull()
    expect(host.querySelector('[data-testid="starrtk-variance-cycles"]')).toBeNull()
    expect(host.querySelector('[data-testid="starrtk-ambiguity-mode"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-adaptive-ratio"]')).not.toBeNull()

    await category('quality_control')
    expect(host.querySelector('[data-testid="starrtk-degraded_guard"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-cycle-slip"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-cycle-slip-lock-flags"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-residual-gate"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-residual-phase-sigma"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-dgnss"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-dgnss-max-float-rms"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-dgnss-max-rms"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-dgnss-min-satellites"]')).not.toBeNull()

    await category('filtering')
    expect(host.querySelector('[data-testid="starrtk-float-hold"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-float-hold-duration"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-motion-prior"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="starrtk-spp-filter"]')).not.toBeNull()
  })
})

describe('StarRTK processing groups', () => {
  it('round-trips grouped exports and preserves the flat executable format', () => {
    const config = parseStarRtkConfig(`
processing:
  positioning_mode: RTD
  min_snr_dbhz: 25
  ar_retry: { enabled: true }
  dgnss: { max_dgnss_rms_m: 2.5 }
  spp_filter: { enabled: true, max_gap_s: 6 }
  trace_directory: starlog
post:
  solution_format: nmea
realtime:
  cycle_ms: 50
`)
    const grouped = stringifyStarRtkConfig(config, 'grouped')
    const raw = parseYaml(grouped)
    expect(Object.keys(raw.processing)).toEqual([
      'positioning',
      'observations',
      'ambiguity',
      'quality_control',
      'filtering',
      'output',
    ])
    expect(raw.processing).toMatchObject({
      positioning: { positioning_mode: 'rtd' },
      observations: { min_snr_dbhz: 25 },
      ambiguity: { ar_retry: { enabled: true } },
      quality_control: { dgnss: { max_dgnss_rms_m: 2.5 } },
      filtering: { spp_filter: { enabled: true, max_gap_s: 6 } },
      output: { trace_directory: 'starlog' },
    })
    expect(parseStarRtkConfig(grouped)).toEqual(config)

    const flat = stringifyStarRtkConfig(config)
    expect(parseYaml(flat).processing).not.toHaveProperty('positioning')
    expect(parseYaml(flat).processing).toHaveProperty('positioning_mode', 'rtd')
    expect(parseStarRtkConfig(flat)).toEqual(config)
  })

  it('allows non-overlapping legacy keys but rejects duplicated or misplaced options', () => {
    expect(
      starRtkProcessing({
        positioning: { positioning_mode: 'spp' },
        min_snr_dbhz: 25,
      }),
    ).toMatchObject({ positioning_mode: 'spp', min_snr_dbhz: 25 })
    expect(() =>
      starRtkProcessing({ observations: { min_snr_dbhz: 25 }, min_snr_dbhz: 30 }),
    ).toThrow('重复配置了 min_snr_dbhz')
    expect(() => starRtkProcessing({ ambiguity: { weighting: 'elevation' } })).toThrow(
      'processing.ambiguity 包含未知键 weighting',
    )
    expect(() => starRtkProcessing({ filtering: false })).toThrow('processing.filtering')
    expect(() => starRtkProcessing({ filtering: { spp_filter: { max_gap_s: -1 } } })).toThrow(
      'max_gap_s',
    )
  })
})

describe('StarRTK 1.1.7 configuration compatibility', () => {
  it('round-trips optional dual-frequency and recovery options through YAML', () => {
    const config = parseStarRtkConfig(`
processing:
  combine_frequencies: true
  widelane_assist: true
  degraded_guard: true
  float_hold:
    enabled: true
    max_duration_s: 3.5
  frequencies:
    gps: [true, false, true]
    beidou: [true, false, true]
    glonass: [false, false, false]
    galileo: [true, false, true]
  cycle_slip:
    enabled: true
    use_lock_flags: true
  motion_prior:
    enabled: true
  residual_gate:
    enabled: true
    phase_sigma: 5
    code_sigma: 8
  ar_retry:
    enabled: true
    max_trials: 4
    max_correction_m: 1
    max_spp_deviation_m: 5
    validate_candidates: true
`)
    expect(config.processing.widelane_assist).toBe(true)
    expect(config.processing.degraded_guard).toBe(true)
    expect(config.processing.float_hold).toEqual({ enabled: true, max_duration_s: 3.5 })
    expect(config.processing.frequencies.beidou).toEqual([true, false, true])
    expect(config.processing.cycle_slip).toEqual({ enabled: true, use_lock_flags: true })
    expect(config.processing.motion_prior).toEqual({ enabled: true })
    expect(config.processing.residual_gate).toEqual({
      enabled: true,
      phase_sigma: 5,
      code_sigma: 8,
    })
    expect(config.processing.ar_retry).toEqual({
      enabled: true,
      max_trials: 4,
      max_correction_m: 1,
      max_spp_deviation_m: 5,
      validate_candidates: true,
    })
    const output = stringifyStarRtkConfig(config)
    expect(output).toContain('widelane_assist: true')
    expect(output).toContain('phase_sigma: 5')
    expect(parseStarRtkConfig(output)).toEqual(config)
  })

  it('uses safe defaults for the new processing groups', () => {
    const options = defaultStarRtkProcessing()
    expect(options.widelane_assist).toBe(false)
    expect(options.degraded_guard).toBe(false)
    expect(options.float_hold).toEqual({ enabled: true, max_duration_s: 5 })
    expect(options.cycle_slip).toEqual({ enabled: false, use_lock_flags: true })
    expect(options.motion_prior).toEqual({ enabled: false })
    expect(options.residual_gate).toEqual({ enabled: false, phase_sigma: 5, code_sigma: 4 })
    expect(options.ar_retry).toEqual({
      enabled: false,
      max_trials: 4,
      max_correction_m: 1,
      max_spp_deviation_m: 5,
      validate_candidates: false,
    })
    expect(options.dgnss).toEqual({
      enabled: false,
      max_float_rms_m: 0.3,
      max_dgnss_rms_m: 5,
      min_satellites: 5,
    })
  })

  it('round trips SPP filter settings and leaves default YAML compatible with older engines', () => {
    const legacy = parseStarRtkConfig('processing: {}')
    expect(legacy.processing.spp_filter.enabled).toBe(false)
    expect(stringifyStarRtkConfig(legacy)).not.toContain('spp_filter:')
    const config = parseStarRtkConfig(`
processing:
  spp_filter:
    enabled: true
    acceleration_noise_mps2: 0.8
    min_position_sigma_m: 2.5
    min_velocity_sigma_mps: 0.07
    innovation_sigma: 3.2
    max_gap_s: 6.5
`)
    expect(config.processing.spp_filter).toEqual({
      enabled: true,
      acceleration_noise_mps2: 0.8,
      min_position_sigma_m: 2.5,
      min_velocity_sigma_mps: 0.07,
      innovation_sigma: 3.2,
      max_gap_s: 6.5,
    })
    expect(parseStarRtkConfig(stringifyStarRtkConfig(config))).toEqual(config)
    config.processing.spp_filter.enabled = false
    expect(parseStarRtkConfig(stringifyStarRtkConfig(config))).toEqual(config)
    expect(() => starRtkProcessing({ spp_filter: { max_gap_s: 0 } })).toThrow('max_gap_s')
    expect(() => starRtkProcessing({ spp_filter: { min_position_sigma_m: Infinity } })).toThrow(
      'min_position_sigma_m',
    )
    expect(() => starRtkProcessing({ spp_filter: { enabled: 'true' } })).toThrow(
      'spp_filter.enabled',
    )
  })

  it('round trips explicit positioning modes and keeps RTK as the omitted default', () => {
    const defaults = parseStarRtkConfig('processing: {}')
    expect(defaults.processing.positioning_mode).toBe('rtk')
    expect(stringifyStarRtkConfig(defaults)).not.toContain('positioning_mode:')
    for (const mode of ['spp', 'rtd']) {
      const config = parseStarRtkConfig(`processing: { positioning_mode: ${mode.toUpperCase()} }`)
      expect(config.processing.positioning_mode).toBe(mode)
      expect(parseStarRtkConfig(stringifyStarRtkConfig(config))).toEqual(config)
    }
    expect(() => starRtkProcessing({ positioning_mode: 'ppp' })).toThrow('positioning_mode')
    expect(() =>
      starRtkProcessing({
        positioning_mode: 'rtd',
        frequencies: {
          gps: [false, true, false],
          beidou: [false, false, false],
          galileo: [false, false, false],
        },
      }),
    ).toThrow('主频')
  })

  it('round trips custom SNR limits including zero and omits the legacy default', () => {
    const config = parseStarRtkConfig('processing: {}')
    expect(config.processing.min_snr_dbhz).toBe(30)
    expect(stringifyStarRtkConfig(config)).not.toContain('min_snr_dbhz:')

    for (const limit of [0, 24, 100]) {
      config.processing.min_snr_dbhz = limit
      const yaml = stringifyStarRtkConfig(config)
      expect(yaml).toContain(`min_snr_dbhz: ${limit}`)
      expect(parseStarRtkConfig(yaml)).toEqual(config)
    }

    for (const invalid of [-1, 25.5, 101, '30']) {
      expect(() => starRtkProcessing({ min_snr_dbhz: invalid })).toThrow('min_snr_dbhz')
    }
  })

  it('rejects invalid advanced options', () => {
    expect(() => starRtkProcessing({ widelane_assist: 'true' })).toThrow('widelane_assist')
    expect(() => starRtkProcessing({ cycle_slip: { use_lock_flags: 'yes' } })).toThrow(
      'use_lock_flags',
    )
    expect(() => starRtkProcessing({ motion_prior: { enabled: 1 } })).toThrow('motion_prior')
    expect(() => starRtkProcessing({ float_hold: { max_duration_s: 0 } })).toThrow('float_hold')
    expect(() => starRtkProcessing({ float_hold: { max_duration_s: 61 } })).toThrow('float_hold')
    expect(() => starRtkProcessing({ residual_gate: { phase_sigma: 0 } })).toThrow('residual_gate')
    expect(() => starRtkProcessing({ ar_retry: { max_trials: 0 } })).toThrow('ar_retry')
    expect(() => starRtkProcessing({ ar_retry: { max_trials: 65 } })).toThrow('ar_retry')
    expect(() => starRtkProcessing({ ar_retry: { max_correction_m: 0 } })).toThrow('ar_retry')
  })

  it('recognizes plain and versioned StarRTK executables', () => {
    expect(isStarRtkExecutable('StarRTK.exe')).toBe(true)
    expect(isStarRtkExecutable('StarRTK')).toBe(true)
    expect(
      isStarRtkExecutable(
        'E:\\Proj-Enhanced\\04-GNSS\\StarRTK\\dist\\StarRTK-v1.1.6-windows-x64.exe',
      ),
    ).toBe(true)
    expect(isStarRtkExecutable('/opt/starrtk/StarRTK_v1.1.6_linux')).toBe(true)
    expect(isStarRtkExecutable('NotStarRTK.exe')).toBe(false)
    expect(isStarRtkExecutable('StarRTK.exe.backup')).toBe(false)
  })
})

describe('StarRTK 1.1.10 QZSS configuration', () => {
  it('inherits the GPS row when loading existing configurations', () => {
    const config = parseStarRtkConfig('processing:\n  frequencies:\n    gps: [true, false, true]')
    expect(config.processing.frequencies.qzss).toEqual([true, false, true])
    expect(config.processing.frequencies.qzss).not.toBe(config.processing.frequencies.gps)
    expect(stringifyStarRtkConfig(config)).not.toContain('qzss:')
  })

  it('round-trips an independent QZSS row with GPS and the other systems disabled', () => {
    const config = parseStarRtkConfig(`
processing:
  frequencies:
    gps: [false, false, false]
    beidou: [false, false, false]
    glonass: [false, false, false]
    galileo: [false, false, false]
    qzss: [true, true, false]
`)
    const yaml = stringifyStarRtkConfig(config)
    expect(yaml).toContain('qzss:')
    expect(parseStarRtkConfig(yaml)).toEqual(config)
  })
})

describe('StarRTK 1.1.9 DGNSS fallback configuration', () => {
  it('round-trips DGNSS fallback options through YAML', () => {
    const config = parseStarRtkConfig(`
processing:
  dgnss:
    enabled: true
    max_float_rms_m: 0.25
    max_dgnss_rms_m: 4.5
    min_satellites: 7
`)
    expect(config.processing.dgnss).toEqual({
      enabled: true,
      max_float_rms_m: 0.25,
      max_dgnss_rms_m: 4.5,
      min_satellites: 7,
    })
    const output = stringifyStarRtkConfig(config)
    expect(output).toContain('dgnss:')
    expect(output).toContain('max_float_rms_m: 0.25')
    expect(parseStarRtkConfig(output)).toEqual(config)
  })

  it('accepts the full StarRTK 1.1.9 processing key set', () => {
    const config = parseStarRtkConfig(`
processing:
  base_static: true
  rover_static: false
  single_epoch: false
  combine_frequencies: true
  widelane_assist: false
  partial_ambiguity: true
  degraded_guard: true
  weighting: signal_strength
  ambiguity_mode: fix_and_hold
  fix_hold:
    min_fixed_epochs: 2
    min_satellites: 6
    min_elevation_deg: 12
    variance_cycles: 0.000001
  ratio:
    adaptive: true
    nominal: 3.2
    minimum: 1.4
    maximum: 4
  ar_retry:
    enabled: true
    max_trials: 6
    max_correction_m: 1.5
    max_spp_deviation_m: 6
    validate_candidates: true
  cycle_slip:
    enabled: true
    use_lock_flags: false
  motion_prior:
    enabled: true
  float_hold:
    enabled: true
    max_duration_s: 8
  residual_gate:
    enabled: true
    phase_sigma: 4.5
    code_sigma: 6
  dgnss:
    enabled: true
    max_float_rms_m: 0.35
    max_dgnss_rms_m: 6
    min_satellites: 8
  frequencies:
    gps: [true, true, false]
    beidou: [true, false, false]
    glonass: [true, false, false]
    galileo: [true, false, false]
  trace_directory: C:/starrtk-logs
`)
    expect(config.processing).toMatchObject({
      weighting: 'signal_strength',
      degraded_guard: true,
      float_hold: { enabled: true, max_duration_s: 8 },
      dgnss: {
        enabled: true,
        max_float_rms_m: 0.35,
        max_dgnss_rms_m: 6,
        min_satellites: 8,
      },
      trace_directory: 'C:/starrtk-logs',
    })
    expect(parseStarRtkConfig(stringifyStarRtkConfig(config))).toEqual(config)
  })

  it('rejects invalid DGNSS limits and unknown keys', () => {
    expect(() => starRtkProcessing({ dgnss: { enabled: 1 } })).toThrow('dgnss')
    expect(() => starRtkProcessing({ dgnss: { max_float_rms_m: 0 } })).toThrow('dgnss')
    expect(() => starRtkProcessing({ dgnss: { max_float_rms_m: 21 } })).toThrow('dgnss')
    expect(() => starRtkProcessing({ dgnss: { max_dgnss_rms_m: 0 } })).toThrow('dgnss')
    expect(() => starRtkProcessing({ dgnss: { max_dgnss_rms_m: 101 } })).toThrow('dgnss')
    expect(() => starRtkProcessing({ dgnss: { min_satellites: 4 } })).toThrow('dgnss')
    expect(() => starRtkProcessing({ dgnss: { min_satellites: 65 } })).toThrow('dgnss')
    expect(() => starRtkProcessing({ dgnss: { min_satellites: 5.5 } })).toThrow('dgnss')
    expect(() => starRtkProcessing({ dgnss: { unknown: true } })).toThrow('未知键')
  })
})
