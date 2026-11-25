import { describe, expect, it } from 'vitest'
import {
  buildRtkNaviConfig,
  buildRtkNaviStreamPath,
  createDefaultRtkNaviSettings,
  parseRtkNaviSolutionRecord,
} from '@/core/gnsslib/RtkNavi'
import { RTKNAVI_ADVANCED_CONFIG } from '@/core/gnsslib/RtkNaviAdvancedOptions'
import { parseRtkPostConfig } from '@/core/gnsslib/RtkPostConfig'

describe('RTKNAVI configuration', () => {
  it('builds three-input rtkrcv options with file replay and solution output', () => {
    const settings = createDefaultRtkNaviSettings()
    settings.inputs[0].path = '/tmp/rover.rtcm3'
    settings.inputs[0].replaySpeed = 2
    settings.inputs[1].enabled = true
    settings.inputs[1].path = 'user:pass@127.0.0.1:2101/mount'
    settings.options.basePositionMode = 'llh'
    settings.options.baseLatitudeDeg = 35.1
    settings.options.baseLongitudeDeg = 139.2
    settings.options.baseHeightM = 70.3
    settings.options.constellations = ['G', 'E', 'C']

    const config = buildRtkNaviConfig(settings, '/tmp/solution.pos')
    expect(config).toContain('inpstr1-type =file')
    expect(config).toContain('inpstr1-path =/tmp/rover.rtcm3::T::x2')
    expect(config).toContain('inpstr2-type =ntripcli')
    expect(config).toContain('inpstr2-path =user:pass@127.0.0.1:2101/mount')
    expect(config).toContain('inpstr3-type =off')
    expect(config).toContain('outstr1-path =/tmp/solution.pos')
    expect(config).toContain('pos1-posmode =kinematic')
    expect(config).toContain('pos1-navsys =41')
    expect(config).toContain('ant2-postype =llh')
    expect(config).toContain('ant2-pos1 =35.1')
    expect(config).toContain('misc-startcmd =\n')
    expect(config).toContain('misc-stopcmd =\n')
  })

  it('omits replay markers at normal speed without time tags', () => {
    const settings = createDefaultRtkNaviSettings()
    settings.inputs[0].path = '/tmp/rover.ubx'
    settings.inputs[0].timeTag = false
    expect(buildRtkNaviStreamPath(settings.inputs[0])).toBe('/tmp/rover.ubx')
  })

  it('requires rover and relative-mode base inputs', () => {
    const settings = createDefaultRtkNaviSettings()
    settings.inputs[0].enabled = false
    expect(() => buildRtkNaviConfig(settings, '/tmp/solution.pos')).toThrow('流动站')

    settings.inputs[0].enabled = true
    settings.inputs[0].path = '/tmp/rover.rtcm3'
    expect(() => buildRtkNaviConfig(settings, '/tmp/solution.pos')).toThrow('基站')

    settings.options.mode = 0
    expect(() => buildRtkNaviConfig(settings, '/tmp/solution.pos')).not.toThrow()
  })

  it('rejects invalid coordinates and config injection through paths', () => {
    const settings = createDefaultRtkNaviSettings()
    settings.inputs[0].path = '/tmp/rover.rtcm3'
    settings.inputs[1].enabled = true
    settings.inputs[1].path = '/tmp/base.rtcm3'
    settings.options.basePositionMode = 'llh'
    settings.options.baseLatitudeDeg = 91
    expect(() => buildRtkNaviConfig(settings, '/tmp/solution.pos')).toThrow('纬度')

    settings.options.baseLatitudeDeg = 35
    expect(() => buildRtkNaviConfig(settings, '/tmp/solution.pos\npos1-posmode=single')).toThrow(
      '换行符',
    )
  })

  it('serializes every shared option with the post-processing config rules', () => {
    const settings = createDefaultRtkNaviSettings()
    settings.inputs[0].path = '/tmp/rover.rtcm3'
    settings.options.mode = 0
    settings.options.frequency = 4
    settings.options.gloArMode = 'autocal'
    settings.options.bdsArEnabled = false
    settings.options.ratioThreshold = 4.2
    settings.options.dopplerSlipThresholdHz = 0.15
    settings.options.phaseErrorM = 0.012
    const config = buildRtkNaviConfig(settings, '/tmp/solution.pos')
    expect(config).toContain('pos1-frequency =l1+l5')
    expect(config).toContain('pos1-soltype =forward')
    const parsed = parseRtkPostConfig(config).options
    for (const { key } of RTKNAVI_ADVANCED_CONFIG) {
      expect(parsed[key], key).toEqual(settings.options[key])
    }
    expect(config).toContain('outstr1-format =llh')
    expect(config).not.toContain('pos1-ts =')
    expect(config).not.toContain('pos1-tint =')
  })

  it('preserves existing base config values and aliases unless explicitly overridden', () => {
    const settings = createDefaultRtkNaviSettings()
    settings.inputs[0].path = '/tmp/rover.rtcm3'
    settings.options.mode = 0
    settings.options.baseConfigPath = '/tmp/custom.conf'
    const source = 'pos2-arthres=6\npos2-thresdop=0.7\ncustom-option=kept\n'
    let generated = buildRtkNaviConfig(settings, '/tmp/solution.pos', source)
    let merged = parseRtkPostConfig(source + generated).options
    expect(merged.ratioThreshold).toBe(6)
    expect(merged.dopplerSlipThresholdHz).toBe(0.7)
    expect(merged.phaseErrorM).toBe(settings.options.phaseErrorM)
    expect(generated).not.toContain('pos2-arthres =')
    expect(generated).not.toContain('pos2-dopthres =')

    settings.options.ratioThreshold = 3
    settings.options.dopplerSlipThresholdHz = 0.25
    settings.advancedOptionOverrides = ['ratioThreshold', 'dopplerSlipThresholdHz']
    generated = buildRtkNaviConfig(settings, '/tmp/solution.pos', source)
    merged = parseRtkPostConfig(source + generated).options
    expect(merged.ratioThreshold).toBe(3)
    expect(merged.dopplerSlipThresholdHz).toBe(0.25)
    expect(generated).toContain('pos2-dopthres =0.25')
  })

  it('rejects invalid advanced settings before launching the engine', () => {
    const settings = createDefaultRtkNaviSettings()
    settings.inputs[0].path = '/tmp/rover.rtcm3'
    settings.options.mode = 0
    settings.options.ratioMin = Number.NaN
    expect(() => buildRtkNaviConfig(settings, '/tmp/solution.pos')).toThrow('pos2-arthresmin')
    settings.options.ratioMin = 1
    settings.options.bdsArEnabled = 'off' as unknown as boolean
    expect(() => buildRtkNaviConfig(settings, '/tmp/solution.pos')).toThrow('pos2-bdsarmode')
  })
})

describe('RTKNAVI solution parser', () => {
  it('parses LLH solutions with quality, satellites, age and ratio', () => {
    expect(
      parseRtkNaviSolutionRecord(
        '2005/04/02 00:00:30.000 35.160874837 139.613834647 69.2997 1 7 0.1 0.2 0.3 0.4 0.5 0.6 1.50 2.80',
      ),
    ).toEqual({
      time: '2005/04/02 00:00:30.000',
      latitude: 35.160874837,
      longitude: 139.613834647,
      height: 69.2997,
      quality: 1,
      satellites: 7,
      age: 1.5,
      ratio: 2.8,
    })
  })

  it('ignores headers and incomplete rows', () => {
    expect(parseRtkNaviSolutionRecord('% GPST latitude longitude height Q ns')).toBeNull()
    expect(parseRtkNaviSolutionRecord('2005/04/02 00:00:30.000 35.1')).toBeNull()
  })
})
