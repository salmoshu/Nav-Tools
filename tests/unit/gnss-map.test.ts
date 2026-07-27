import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS map track retention', () => {
  const source = readFileSync('src/components/windows/gnss/GnssMap.vue', 'utf8')

  it('offers sliding-window and full-history modes', () => {
    expect(source).toContain('v-model="slidingWindow"')
    expect(source).toContain(`:active-text="t('gnss.map.slidingWindow')"`)
    expect(source).toContain(`:inactive-text="t('gnss.map.all')"`)
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
    expect(source).toContain('TRACK_BULK_POINTS_PER_FRAME = 4096')
    expect(source).toContain('appendTrackRange(pendingTrackHead, end)')
    expect(source).toContain('segment.line.setLatLngs(segment.latlngs)')
    expect(source).not.toContain('POSITION_UPDATE_INTERVAL_MS')
  })

  it('fits the complete imported track and disables automatic follow', () => {
    expect(source).toContain('function fitCompleteTrack()')
    expect(source).toContain('map.fitBounds(bounds')
    expect(source).toContain('if (active) follow.value = false')
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

  it('removes the previous position marker when replay resets the track', () => {
    expect(source).toContain('() => gnssStore.trackResetToken')
    expect(source).toMatch(
      /function resetTrackHistory\(\)[\s\S]*positionMarker\?\.remove\(\)[\s\S]*positionMarker = null/,
    )
  })
})
