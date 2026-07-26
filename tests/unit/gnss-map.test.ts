import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS map track retention', () => {
  const source = readFileSync('src/components/windows/gnss/GnssMap.vue', 'utf8')

  it('offers sliding-window and full-history modes', () => {
    expect(source).toContain('v-model="slidingWindow"')
    expect(source).toContain('active-text="滑窗"')
    expect(source).toContain('inactive-text="全部"')
    expect(source).toContain('const slidingWindow = ref(false)')
    expect(source).toContain('TRACK_WINDOW_POINTS = 2000')
    expect(source).toContain('if (slidingWindow.value) trimTrackToWindow()')
  })

  it('updates bounded polyline chunks instead of rebuilding the whole track', () => {
    expect(source).toContain('TRACK_SEGMENT_POINTS = 200')
    expect(source).toContain('lastSegment.line.addLatLng(point.latlng)')
    expect(source).toContain('firstSegment.line.setLatLngs(firstSegment.latlngs)')
    expect(source).toContain('firstSegment.line.remove()')
  })

  it('queues every precise GGA point and drains the queue across animation frames', () => {
    expect(source).toContain('const { mapTrackPoints } = useNmea()')
    expect(source).toContain('pendingTrackPoints.push(source[index])')
    expect(source).toContain('requestAnimationFrame(renderPendingTrack)')
    expect(source).toContain('TRACK_RENDER_BUDGET_MS = 4')
    expect(source).not.toContain('POSITION_UPDATE_INTERVAL_MS')
  })

  it('disables Leaflet path simplification so displayed geometry retains every point', () => {
    expect(source).toContain('smoothFactor: 0')
  })

  it('passes the actual previous point when starting a segment', () => {
    expect(source).toContain(
      'function appendTrackPoint(point: TrackPoint, previousPoint?: TrackPoint)',
    )
    expect(source).toContain('appendTrackPoint(point, previousPoint)')
    expect(source).not.toContain('trackPoints[trackPoints.length - 2]')
  })
})
