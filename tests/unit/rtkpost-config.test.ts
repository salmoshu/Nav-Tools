import { describe, expect, it } from 'vitest'
import { mergeRtkPostConfig, parseRtkPostConfig } from '@/core/gnsslib/RtkPostConfig'
import { createDefaultRtkPostSettings } from '@/core/gnsslib/RtkPost'

describe('RTKPOST configuration', () => {
  it('loads processing, ambiguity, filter and output values from an Open-GNSS config', () => {
    const parsed = parseRtkPostConfig(`
      pos1-posmode=static # static RTK
      pos1-frequency=l1+l2+l5
      pos1-navsys=41
      pos2-armode=fix-and-hold
      pos2-gloarmode=autocal
      pos2-bdsarmode=on
      pos2-arthres=3.5
      pos2-arthresmin=1.3
      pos2-arthresmax=6
      pos2-minfixsats=8
      pos2-slipthres=0.075
      stats-eratio1=250
      stats-errphaseel=0.004
      stats-prnaccelv=2.5
      stats-clkstab=5e-12
      out-solformat=nmea
      out-timesys=utc
      out-outstat=residual
    `)

    expect(parsed.options).toMatchObject({
      mode: 3,
      frequency: 3,
      constellations: ['G', 'E', 'C'],
      ambiguityResolution: 'fix-and-hold',
      gloArMode: 'autocal',
      bdsArEnabled: true,
      ratioThreshold: 3.5,
      ratioMin: 1.3,
      ratioMax: 6,
      minFixSats: 8,
      gfSlipThresholdM: 0.075,
      errorRatioL1: 250,
      phaseElevationErrorM: 0.004,
      receiverAccelVerticalMps2: 2.5,
      clockStabilitySps: 5e-12,
      outputFormat: 'nmea',
      timeSystem: 'utc',
      outputStatus: 2,
    })
    expect(parsed.recognizedKeys).toHaveLength(18)
  })

  it('round-trips every exposed option through the effective configuration', () => {
    const options = createDefaultRtkPostSettings().options
    Object.assign(options, {
      startTime: '2024-07-30T01:02:03.500',
      endTime: '2024-07-30T02:03:04.750',
      intervalS: 0.2,
      frequency: 4,
      ambiguityResolution: 'off',
      gloArMode: 'autocal',
      outputFormat: 'nmea',
      timeSystem: 'utc',
      outputStatus: 2,
    })
    const merged = mergeRtkPostConfig('', options)
    expect(parseRtkPostConfig(merged).options).toEqual(options)
  })

  it('preserves unmanaged lines and comments while form values replace matching entries', () => {
    const options = createDefaultRtkPostSettings().options
    Object.assign(options, {
      ambiguityResolution: 'fix-and-hold',
      outputFormat: 'llh',
      intervalS: null,
    })
    const merged = mergeRtkPostConfig(
      [
        '# source comment',
        'pos2-armode=continuous # retain this explanation',
        'file-dcbfile=/data/products/dcb.txt',
        'out-solformat=nmea',
        'pos1-tint=1',
      ].join('\n'),
      options,
    )

    expect(merged).toContain('# source comment')
    expect(merged).toContain('file-dcbfile=/data/products/dcb.txt')
    expect(merged).toContain('pos2-armode=fix-and-hold # retain this explanation')
    expect(merged).toContain('out-solformat=llh')
    expect(merged).not.toContain('pos1-tint=')
  })

  it('updates both Doppler threshold aliases and ignores invalid input', () => {
    const options = createDefaultRtkPostSettings().options
    options.dopplerSlipThresholdHz = 0.25
    const merged = mergeRtkPostConfig('pos2-dopthres=0\npos2-thresdop=10', options)
    expect(merged.match(/dopthres=0\.25/g)).toHaveLength(1)
    expect(merged).toContain('pos2-thresdop=0.25')

    const parsed = parseRtkPostConfig('pos1-elmask=invalid\npos2-minfixsats=-1\nunknown=value')
    expect(parsed.options).toEqual({})
    expect(parsed.recognizedKeys).toEqual([])
  })
})
