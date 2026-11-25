import { describe, expect, it } from 'vitest'
import {
  buildRtkLibExConfig,
  parseRtkLibExConfig,
  RTKLIB_EX_OPTIONS,
  rtkLibExOutputFormat,
  rtkLibExPositionMode,
} from '@/core/gnsslib/RtkLibExConfig'
import {
  buildRtkPostArgs,
  createDefaultRtkPostSettings,
  rtkPostRequiresBase,
  defaultRtkPostOutputPath,
} from '@/core/gnsslib/RtkPost'

describe('RTKLIB-EX 2.5.1 native configuration', () => {
  it('reads and writes native enums and numeric parameters without OpenGNSS-only keys', () => {
    const options = parseRtkLibExConfig(
      [
        '\uFEFFpos1-soltype = 3 # RTKLIB-EX combined without resetting phase',
        'stats-prnpos = 2e-2',
        'out-timesys = 2',
        'pos2-rejionno = 6',
        'pos1-ts = 2026/07/18 00:00:00',
      ].join('\n'),
    )
    expect(options).toEqual({
      'pos1-soltype': 'combined-nophasereset',
      'stats-prnpos': '0.02',
      'out-timesys': 'jst',
      'pos2-rejphase': '6',
    })
    const saved = buildRtkLibExConfig(options)
    expect(saved).toContain('pos1-soltype=combined-nophasereset\n')
    expect(saved).not.toContain('pos1-ts')
    expect(saved).not.toContain('pos2-rejionno')
    expect(parseRtkLibExConfig(saved)).toMatchObject(options)
    expect(new Set(RTKLIB_EX_OPTIONS.map(({ key }) => key)).size).toBe(RTKLIB_EX_OPTIONS.length)
  })

  it('rejects unknown keys, invalid choices, and values that would exceed native text buffers', () => {
    expect(() => buildRtkLibExConfig({ 'pos1-ts': '2026/07/18' })).toThrow('pos1-ts')
    expect(() => buildRtkLibExConfig({ 'pos1-soltype': '5' })).toThrow('pos1-soltype')
    expect(() => buildRtkLibExConfig({ 'ant1-anttype': 'a'.repeat(64) })).toThrow('ant1-anttype')
    expect(() => buildRtkLibExConfig({ 'file-dcbfile': 'a\nb' })).toThrow('file-dcbfile')
  })

  it('uses the EX options for base and output format and does not pass OpenGNSS CLI overrides', () => {
    const defaults = createDefaultRtkPostSettings()
    const request = {
      ...defaults,
      engine: 'rtklib-ex' as const,
      executablePath: '/ex/rnx2rtkp',
      configPath: '/ex/native.conf',
      roverObsPath: '/data/rover.obs',
      baseObsPath: '',
      navPaths: ['/data/rover.nav'],
      outputPath: '/data/rover.rtklib-ex.nmea',
      options: { ...defaults.options, startTime: '2025-04-02T00:00:30' },
      rtklibExParameters: parseRtkLibExConfig('pos1-posmode=single\nout-solformat=nmea\n'),
    }
    expect(rtkLibExPositionMode(request.rtklibExParameters)).toBe(0)
    expect(rtkLibExOutputFormat(request.rtklibExParameters)).toBe('nmea')
    expect(rtkPostRequiresBase(request)).toBe(false)
    expect(defaultRtkPostOutputPath(request.roverObsPath, 'nmea', request.engine)).toBe(
      request.outputPath,
    )
    expect(buildRtkPostArgs(request)).toEqual([
      '-k',
      request.configPath,
      '-o',
      request.outputPath,
      '-ts',
      '2025/04/02',
      '00:00:30',
      request.roverObsPath,
      request.navPaths[0],
    ])
    expect(() => buildRtkPostArgs({ ...request, executablePath: '' })).toThrow('RTKLIB-EX')
  })
})
