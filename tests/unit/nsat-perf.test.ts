/**
 * NSat 图表性能测试：解析 rs.txt（11+ 分钟 NMEA 数据）后验证数据处理性能
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNmea } from '@/composables/gnss/useNmea'

const RAW = readFileSync('C:\\Users\\ESSZ\\Desktop\\gnss-test\\rs.txt', 'utf8')
const LINES = RAW.split('\n')

// 解析 88k 行 NMEA 数据需要较长时间，设置 30s 超时
const PERF_TIMEOUT = 30000

describe('NSat chart performance with 11min real NMEA data', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useNmea().clearData()
  })

  it('processes 88k NMEA lines within performance budget', () => {
    const { satelliteSnrData, currentData, parseNmea } = useNmea()

    const start = performance.now()
    let processed = 0
    for (const line of LINES) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('$')) continue
      parseNmea(trimmed)
      processed++
    }
    const elapsed = performance.now() - start

    console.log(`Processed ${processed} lines in ${elapsed.toFixed(1)}ms`)
    console.log(`SatelliteSnrData size: ${satelliteSnrData.value.length}`)
    console.log(`Current time: ${currentData.value.time}`)

    // 88k 行处理应在 8s 内完成（环境波动留余量）
    expect(elapsed).toBeLessThan(8000)
    expect(satelliteSnrData.value.length).toBeGreaterThan(0)
  }, PERF_TIMEOUT)

  it('builds 600+ nsat history samples efficiently', () => {
    const { satelliteSnrData, currentData, parseNmea } = useNmea()

    const NSAT_CONSTELLATIONS = ['GPS', 'GLONASS', 'BEIDOU', 'GALILEO', 'QZSS', 'OTHER']
    const history: Array<{ time: string; counts: Record<string, number> }> = []
    let lastGpsTime: string | null = null

    const start = performance.now()
    for (const line of LINES) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('$')) continue
      parseNmea(trimmed)

      const rawGpsTime = currentData.value?.time
      if (!rawGpsTime || rawGpsTime === lastGpsTime) continue
      lastGpsTime = rawGpsTime

      const match = rawGpsTime.match(/(\d{1,2}):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\s*$/)
      if (!match) continue

      const pad = (n: number) => String(n).padStart(2, '0')
      const timeLabel = `${pad(Number(match[1]))}:${pad(Number(match[2]))}:${pad(Math.floor(Number(match[3])))}`

      const counts: Record<string, number> = {}
      for (const name of NSAT_CONSTELLATIONS) counts[name] = 0
      for (const sat of satelliteSnrData.value) {
        const name = NSAT_CONSTELLATIONS.includes(sat.constellation) ? sat.constellation : 'OTHER'
        counts[name]++
      }
      history.push({ time: timeLabel, counts })
    }
    const elapsed = performance.now() - start

    console.log(`Built ${history.length} nsat samples in ${elapsed.toFixed(1)}ms`)
    // 应在 10s 内完成（包含解析，环境波动留余量）
    expect(elapsed).toBeLessThan(10000)
    // 11 分钟数据应有 600+ 个采样
    expect(history.length).toBeGreaterThan(600)
  }, PERF_TIMEOUT)
})
