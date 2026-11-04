import { describe, expect, it } from 'vitest'
import {
  buildRtkPostArgs,
  createDefaultRtkPostSettings,
  defaultRtkPostOutputPath,
  RtkPostSolutionParser,
  type RtkPostSettings,
} from '@/core/gnssraw/RtkPost'

function settings(): RtkPostSettings {
  const value = createDefaultRtkPostSettings()
  value.roverObsPath = '/data/rover.obs'
  value.baseObsPath = '/data/base.obs'
  value.navPaths = ['/data/rover.nav']
  value.outputPath = '/data/rover.pos'
  return value
}

describe('RTKPOST command line', () => {
  it('builds the rnx2rtkp default RTK invocation in rover/base/nav order', () => {
    expect(buildRtkPostArgs(settings())).toEqual([
      '-o',
      '/data/rover.pos',
      '-p',
      '2',
      '-f',
      '2',
      '-m',
      '15',
      '-sys',
      'G,R',
      '-v',
      '3',
      '-t',
      '-d',
      '3',
      '-y',
      '0',
      '-x',
      '0',
      '/data/rover.obs',
      '/data/base.obs',
      '/data/rover.nav',
    ])
  })

  it('maps config, processing, time and output options to CLI arguments', () => {
    const value = settings()
    value.configPath = '/data/rtk.conf'
    value.options = {
      ...value.options,
      mode: 3,
      frequency: 1,
      solutionType: 2,
      ambiguityResolution: 'fix-and-hold',
      constellations: ['G', 'E', 'C'],
      elevationMaskDeg: 20,
      ratioThreshold: 2.5,
      startTime: '2024-07-30T01:02:03',
      endTime: '2024-07-30 02:03:04.500',
      intervalS: 0.2,
      outputFormat: 'xyz',
      timeSystem: 'utc',
      timeFormat: 'tow',
      timeDecimals: 2,
      outputStatus: 2,
      traceLevel: 3,
    }
    const args = buildRtkPostArgs(value)

    expect(args).toContain('-k')
    expect(args).toContain('-c')
    expect(args).toContain('-h')
    expect(args).toContain('-e')
    expect(args).toContain('-u')
    expect(args).not.toContain('-t')
    expect(args.slice(0, 4)).toEqual(['-k', '/data/rtk.conf', '-o', '/data/rover.pos'])
    expect(args).toEqual(
      expect.arrayContaining([
        '-sys',
        'G,E,C',
        '-ts',
        '2024/07/30',
        '01:02:03',
        '-te',
        '2024/07/30',
        '02:03:04.500',
        '-ti',
        '0.2',
      ]),
    )
    expect(args.slice(-3)).toEqual(['/data/rover.obs', '/data/base.obs', '/data/rover.nav'])
  })

  it('omits the base file for single and PPP modes', () => {
    const value = settings()
    value.options.mode = 0
    value.baseObsPath = ''
    value.options.constellations = ['G']
    const args = buildRtkPostArgs(value)
    expect(args.slice(-2)).toEqual(['/data/rover.obs', '/data/rover.nav'])

    value.options.mode = 7
    expect(buildRtkPostArgs(value).slice(-2)).toEqual(['/data/rover.obs', '/data/rover.nav'])
  })

  it('rejects missing base observations, empty systems and invalid time ranges', () => {
    const value = settings()
    value.baseObsPath = ''
    expect(() => buildRtkPostArgs(value)).toThrow('基站')

    value.baseObsPath = '/data/base.obs'
    value.options.constellations = []
    expect(() => buildRtkPostArgs(value)).toThrow('至少选择')

    value.options.constellations = ['G']
    value.options.startTime = '2024-07-30T02:00:00'
    value.options.endTime = '2024-07-30T01:00:00'
    expect(() => buildRtkPostArgs(value)).toThrow('结束时间')
  })

  it('enforces the rnx2rtkp sixteen-input limit', () => {
    const value = settings()
    value.navPaths = Array.from({ length: 15 }, (_, index) => `/data/${index}.nav`)
    expect(() => buildRtkPostArgs(value)).toThrow('16')
  })

  it('derives .pos and .nmea output names from rover observations', () => {
    expect(defaultRtkPostOutputPath('C:\\data\\rover.obs', 'llh')).toBe('C:\\data\\rover.pos')
    expect(defaultRtkPostOutputPath('/data/rover.obs.gz', 'nmea')).toBe('/data/rover.nmea')
  })
})

describe('RTKPOST solution parsing', () => {
  it('summarizes calendar-time LLH solutions and retains a bounded preview', () => {
    const parser = new RtkPostSolutionParser('llh', 'hms')
    parser.addLine('%  GPST latitude longitude height Q ns')
    for (const quality of [1, 1, 2, 3, 4, 5, 6, 0]) {
      parser.addLine(`2024/07/30 00:00:00.000 31.0 121.0 10.0 ${quality} 12`)
    }
    const result = parser.finish(1234)

    expect(result).toMatchObject({
      epochs: 8,
      fixed: 2,
      float: 1,
      sbas: 1,
      dgps: 1,
      single: 1,
      ppp: 1,
      other: 1,
      sizeBytes: 1234,
    })
    expect(result.preview).toContain('GPST latitude')
    expect(result.preview).toContain('2024/07/30')
  })

  it('parses time-of-week solutions', () => {
    const parser = new RtkPostSolutionParser('xyz', 'tow')
    parser.addLine('123456.000 -2700000 4200000 3300000 1 10')
    expect(parser.finish(50).fixed).toBe(1)
  })

  it('parses NMEA GGA quality and skips other sentences', () => {
    const parser = new RtkPostSolutionParser('nmea', 'hms')
    parser.addLine('$GNGGA,000000.00,3100.0,N,12100.0,E,1,12,1.0,10.0,M,,,,*00')
    parser.addLine('$GPGGA,000001.00,3100.0,N,12100.0,E,5,09,1.0,10.0,M,,,,*00')
    parser.addLine('$GNZDA,000000.00,30,07,2024,00,00*00')
    const result = parser.finish(100)
    expect(result.epochs).toBe(2)
    expect(result.fixed).toBe(1)
    expect(result.single).toBe(1)
  })
})
