import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS signal SNR bar chart view', () => {
  const source = readFileSync('src/components/windows/gnss/GnssSignal.vue', 'utf8')

  it('imports echarts and renders a bar series', () => {
    expect(source).toContain("import * as echarts from 'echarts'")
    expect(source).toContain("type: 'bar'")
  })

  it('provides view toggle between table and chart', () => {
    expect(source).toContain('v-model="currentView"')
    expect(source).toContain('label="table"')
    expect(source).toContain('label="chart"')
  })

  it('adds SNR reference lines at 25/35/45 dB', () => {
    expect(source).toContain('markLine')
    expect(source).toContain('yAxis: 25')
    expect(source).toContain('yAxis: 35')
    expect(source).toContain('yAxis: 45')
  })

  it('shows PRN, constellation, elevation, azimuth and SNR in tooltip', () => {
    expect(source).toContain('data.prn')
    expect(source).toContain('data.constellation')
    expect(source).toContain('data.elevation')
    expect(source).toContain('data.azimuth')
    expect(source).toContain('data.value')
  })

  it('filters chart data by constellation', () => {
    expect(source).toContain('constellationFilter')
    expect(source).toContain("sat.constellation === constellationFilter.value")
  })

  it('adapts chart size to container', () => {
    expect(source).toContain('ResizeObserver')
    expect(source).toContain('chartInstance.value.resize()')
  })
})
