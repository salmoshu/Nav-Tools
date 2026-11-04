import { describe, expect, it } from 'vitest'
import {
  buildRtkNaviConfig,
  buildRtkNaviStreamPath,
  createDefaultRtkNaviSettings,
  parseRtkNaviSolutionLine,
} from '@/core/gnsslib/RtkNavi'

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
})

describe('RTKNAVI solution parser', () => {
  it('parses LLH solutions with quality, satellites, age and ratio', () => {
    expect(
      parseRtkNaviSolutionLine(
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
    expect(parseRtkNaviSolutionLine('% GPST latitude longitude height Q ns')).toBeNull()
    expect(parseRtkNaviSolutionLine('2005/04/02 00:00:30.000 35.1')).toBeNull()
  })
})
