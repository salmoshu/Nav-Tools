import { describe, expect, it } from 'vitest'
import type { SatelliteEpochSample } from '@/core/gnss/SatelliteEpochAssembler'
import { SatelliteEpochStore } from '@/core/gnss/SatelliteEpochStore'
import { buildSatelliteSeriesGeometry } from '@/core/render/SatelliteTimeSeriesRenderer'

const EPOCH_COUNT = 12 * 60 * 60 * 10
const FIELDS = ['GPS', 'GLONASS', 'BEIDOU', 'GALILEO', 'QZSS', 'OTHER', 'TOTAL'] as const

function epoch(index: number): SatelliteEpochSample {
  const timestamp = index * 100
  const hours = Math.floor(timestamp / 3_600_000)
  const minutes = Math.floor(timestamp / 60_000) % 60
  const seconds = Math.floor(timestamp / 1_000) % 60
  const tenths = Math.floor(timestamp / 100) % 10
  const time =
    `${String(hours).padStart(2, '0')}:` +
    `${String(minutes).padStart(2, '0')}:` +
    `${String(seconds).padStart(2, '0')}.${tenths}`
  const gps = 10 + (index % 9)
  const glonass = 7 + (index % 5)
  const beidou = 12 + (index % 11)
  const galileo = 5 + (index % 7)
  const qzss = index % 4
  const other = index % 3
  return {
    key: time,
    time,
    counts: {
      GPS: gps,
      GLONASS: glonass,
      BEIDOU: beidou,
      GALILEO: galileo,
      QZSS: qzss,
      OTHER: other,
    },
    total: gps + glonass + beidou + galileo + qzss + other,
    complete: true,
  }
}

describe('SatelliteEpochStore 12-hour performance audit', () => {
  it('measures a seven-series full-overview rebuild while data keeps growing', () => {
    const store = new SatelliteEpochStore()
    const appendStarted = performance.now()
    for (let index = 0; index < EPOCH_COUNT; index += 1) {
      store.append(epoch(index))
    }
    const appendMs = performance.now() - appendStarted

    const extract = (prepareRendererGeometry = false) => {
      let outputPoints = 0
      for (const field of FIELDS) {
        const result = store.extractSeries(field, 0, store.length - 1, 2_400)
        if (prepareRendererGeometry) {
          buildSatelliteSeriesGeometry(
            new Float32Array(result.points),
            new Uint32Array(result.segments),
          )
        }
        outputPoints += result.points.length / 2
      }
      return outputPoints
    }

    extract()
    const extractionSamples: number[] = []
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const started = performance.now()
      const outputPoints = extract()
      extractionSamples.push(performance.now() - started)
      expect(outputPoints).toBeLessThanOrEqual(FIELDS.length * 2_400)
    }
    extract(true)
    const chartPreparationSamples: number[] = []
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const started = performance.now()
      const outputPoints = extract(true)
      chartPreparationSamples.push(performance.now() - started)
      expect(outputPoints).toBeLessThanOrEqual(FIELDS.length * 2_400)
    }

    extractionSamples.sort((a, b) => a - b)
    chartPreparationSamples.sort((a, b) => a - b)
    const medianMs = extractionSamples[Math.floor(extractionSamples.length / 2)]
    const chartPreparationMedianMs =
      chartPreparationSamples[Math.floor(chartPreparationSamples.length / 2)]
    const worstMs = extractionSamples[extractionSamples.length - 1]
    const rangeMaxStarted = performance.now()
    store.getRangeMax('TOTAL', 0, store.length - 1)
    const rangeMaxMs = performance.now() - rangeMaxStarted
    // The store allocates 30 bytes per epoch of TypedArray capacity:
    // time(8) + wall time(4) + 6 counts(12) + total(4) + flags(2).
    const typedArrayBytes = store.capacity * 30

    console.info(
      `[nsat-perf-audit] append=${appendMs.toFixed(1)}ms ` +
        `sevenSeriesMedian=${medianMs.toFixed(1)}ms ` +
        `sevenSeriesWorst=${worstMs.toFixed(1)}ms ` +
        `chartPreparationMedian=${chartPreparationMedianMs.toFixed(1)}ms ` +
        `rangeMax=${rangeMaxMs.toFixed(1)}ms ` +
        `typedArrays=${(typedArrayBytes / 1024 / 1024).toFixed(2)}MiB ` +
        `capacity=${store.capacity}`,
    )

    expect(store.length).toBe(EPOCH_COUNT)
  }, 30_000)
})
