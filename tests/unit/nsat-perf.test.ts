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

  it(
    'processes 88k NMEA lines within performance budget',
    () => {
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
    },
    PERF_TIMEOUT,
  )

  it(
    'retains the complete satellite epoch history from real desktop sample',
    () => {
      const { satelliteEpochHistory, positionEpochHistory, speedEpochHistory, parseNmea } =
        useNmea()

      const start = performance.now()
      let processed = 0
      for (const line of LINES) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('$')) continue
        parseNmea(trimmed)
        processed++
      }
      const elapsed = performance.now() - start

      const history = satelliteEpochHistory.value
      const last = history.getSample(history.length - 1)

      console.log(
        `Parsed ${processed} lines, built ${history.length} epoch samples in ${elapsed.toFixed(1)}ms`,
      )
      console.log(
        `Last epoch time: ${last?.time}, total: ${last?.total}, complete: ${last?.complete}`,
      )

      // 解析 88k 行并构建历元历史应在性能预算内（环境波动留余量）
      expect(elapsed).toBeLessThan(10000)
      // 每个完整 GSV 周期在 GGA 提交，最多保留 6000 历元
      expect(history.length).toBe(6441)
      expect(last.time).toBe('09:23:27.800')
      expect(last.total).toBe(32)
      expect(last.complete).toBe(true)
      expect(positionEpochHistory.value.length).toBe(6441)
      expect(speedEpochHistory.value.length).toBeGreaterThan(6400)
      expect(
        speedEpochHistory.value.getValue('SPEED', speedEpochHistory.value.length - 1),
      ).not.toBeNull()
    },
    PERF_TIMEOUT,
  )
})
