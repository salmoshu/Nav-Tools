import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS deviation position and speed views', () => {
  const source = readFileSync('src/components/windows/gnss/GnssDeviation.vue', 'utf8')
  const metric = readFileSync('src/components/windows/gnss/GnssMetricTimeSeries.vue', 'utf8')

  it('provides deviation, position, and speed view options', () => {
    expect(source).toContain('value="deviation"')
    expect(source).toContain('value="position"')
    expect(source).toContain('value="speed"')
    expect(source).toContain("type DeviationView = 'deviation' | 'position' | 'speed'")
  })

  it('renders E, N, and U as three separate rows', () => {
    expect(source).toContain('class="position-chart-grid"')
    expect(source).toContain('grid-template-rows: repeat(3, minmax(220px, 1fr))')
    expect(source).toContain('grid-template-columns: 1fr')
    for (const field of ['E', 'N', 'U']) {
      expect(source).toContain(`field="${field}"`)
    }
  })

  it('adds a separate ground-speed chart in km/h', () => {
    expect(source).toContain('class="speed-chart-container"')
    expect(source).toContain('field="SPEED"')
    expect(source).toContain('unit="km/h"')
  })

  it('uses the WebGL time-series renderer and pixel-bounded LOD', () => {
    expect(metric).toContain('createSatelliteTimeSeriesRenderer')
    expect(metric).toContain('store.extractSeries')
    expect(metric).toContain('new Float32Array(extracted.points)')
    expect(metric).toContain('OVERVIEW_RENDER_INTERVAL_MS = 1_000')
    expect(metric).not.toContain("renderer: 'svg'")
    expect(metric).not.toContain('import * as echarts')
  })

  it('supports zoom, pan, reset, resize, tooltip, and cleanup', () => {
    expect(metric).toContain('@wheel.prevent="handleWheel"')
    expect(metric).toContain('@dblclick="fitAll"')
    expect(metric).toContain('zoomSatelliteCountViewport')
    expect(metric).toContain('panSatelliteCountViewport')
    expect(metric).toContain('ResizeObserver')
    expect(metric).toContain('store.getValue')
    expect(metric).toContain('renderer?.dispose()')
  })

  it('keeps the existing WebGL deviation renderer intact', () => {
    expect(source).toContain('createTrajectoryRenderer')
    expect(source).toContain('renderer?.setViewport')
    expect(source).toContain('renderer?.dispose()')
  })

  it('uses batch upload for imported deviation backlogs and a frame budget for live data', () => {
    expect(source).toContain('deviationPoints: plotData')
    expect(source).toContain('BULK_RENDER_THRESHOLD = 512')
    expect(source).toContain('renderer.addPointsBatch(points.slice(renderedPointCount))')
    expect(source).toContain('RENDER_QUEUE_TARGET_FRAMES = 2')
    expect(source).toContain('RENDER_MAX_POINTS_PER_FRAME = 128')
    expect(source).toContain('RENDER_BUDGET_MS = 4')
    expect(source).toContain('getLatestRenderedPoint')
    expect(source).toContain('renderedPointCount')
    expect(source).toContain('fitDeviationPoints(')
    expect(source).toContain('isTracking.value = false')
  })

  it('moves deviation and metric cursors with the shared file timeline', () => {
    expect(source).toContain('getTimelinePositionPoint')
    expect(source).toContain('history.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)')
    expect(metric).toContain('useFileTimeline')
    expect(metric).toContain('store.findNearestElapsedTime(fileTimeline.elapsedMilliseconds.value)')
  })
})
