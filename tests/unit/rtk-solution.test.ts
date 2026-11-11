import { describe, expect, it } from 'vitest'
import { RtkSolutionParser } from '@/core/gnsslib/RtkSolution'

describe('Open-GNSS/RTKLIB solution parser', () => {
  it('parses the calendar-time LLH format emitted by rnx2rtkp', () => {
    const parser = new RtkSolutionParser()
    parser.addLine(
      '% (lat/lon/height=WGS84/ellipsoidal,Q=1:fix,2:float,3:sbas,4:dgps,5:single,6:ppp,ns=# of satellites)',
    )
    parser.addLine(
      '%  GPST                  latitude(deg) longitude(deg)  height(m)   Q  ns   sdn(m)   sde(m)   sdu(m)  sdne(m)  sdeu(m)  sdun(m) age(s)  ratio',
    )
    const solution = parser.addLine(
      '2024/04/26 03:21:26.000   39.980744192  116.476662780    63.7868   5  37   1.6799   1.5348   3.9175   0.2917  -0.1107  -1.8127   0.00    0.0',
    )

    expect(solution).toMatchObject({
      time: '2024/04/26 03:21:26.000',
      latitude: 39.980744192,
      longitude: 116.47666278,
      height: 63.7868,
      quality: 5,
      satellites: 37,
      sdn: 1.6799,
      sde: 1.5348,
      sdu: 3.9175,
      sdne: 0.2917,
      sdeu: -0.1107,
      sdun: -1.8127,
      age: 0,
      ratio: 0,
      format: 'llh',
    })
  })

  it('uses Open-GNSS headers to parse XYZ and converts it to LLH', () => {
    const parser = new RtkSolutionParser()
    parser.addLine('%  GPST                  x-ecef(m)        y-ecef(m)        z-ecef(m)   Q  ns')
    const solution = parser.addLine(
      '2024/04/26 03:21:26.000  1120000.0  -4840000.0  3980000.0  1  12',
    )

    expect(solution?.format).toBe('xyz')
    expect(solution?.quality).toBe(1)
    expect(solution?.satellites).toBe(12)
    expect(solution?.latitude).toBeGreaterThan(30)
    expect(solution?.latitude).toBeLessThan(50)
    expect(solution?.longitude).toBeLessThan(0)
  })

  it('parses GPS week and seconds when the solution uses time-of-week output', () => {
    const parser = new RtkSolutionParser({ timeFormat: 'tow' })
    parser.addLine('%  GPST                  latitude(deg) longitude(deg)  height(m)   Q  ns')
    const solution = parser.addLine('2317  272486.000  39.98  116.47  63.7  1  20')

    expect(solution?.time).toMatch(/^2024\/06\/05 /)
    expect(solution?.quality).toBe(1)
  })

  it('skips headers, malformed rows, and ENU rows without a reference position', () => {
    const parser = new RtkSolutionParser()
    expect(parser.addLine('% GPST latitude longitude height Q ns')).toBeNull()
    expect(parser.addLine('not a solution row')).toBeNull()

    const enu = new RtkSolutionParser({ format: 'enu' })
    enu.addLine('%  GPST                  e-baseline(m) n-baseline(m) u-baseline(m) Q ns')
    expect(enu.addLine('2024/04/26 03:21:26.000 1.0 2.0 3.0 1 10')).toBeNull()
  })
})
