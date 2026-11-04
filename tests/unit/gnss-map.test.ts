import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GNSS map track rendering', () => {
  const source = readFileSync('src/components/windows/gnss/GnssMap.vue', 'utf8')

  it('renders the full track with pixel-density simplification instead of a retention-mode switch', () => {
    // 滑窗/全部 开关移除：全量轨迹常驻，靠像素密度抽稀保证渲染开销恒定
    expect(source).not.toContain('slidingWindow')
    expect(source).not.toContain('TRACK_WINDOW_POINTS')
    expect(source).not.toContain('trimTrackToWindow')
    expect(source).not.toContain('trimOldestTrackPoints')
    expect(source).toContain('MIN_TRACK_PIXELS = 1.5')
    expect(source).toContain('createTrackSimplifier(MIN_TRACK_PIXELS, projectLatLng)')
    // 渲染前先过抽稀判定：屏幕上无区分度的采样点跳过
    expect(source).toContain('simplifier.test(sourcePoint[1], sourcePoint[0])')
    // 缩放级别变化后按新精度全量重建（放大补回细节），且不重置居中状态
    expect(source).toContain("map.on('zoomend', handleZoomEnd)")
    expect(source).toMatch(
      /function handleZoomEnd\(\): void \{[\s\S]*?clearRenderedTrack\(\)[\s\S]*?syncTrackSource\(\)\r?\n\}/,
    )
  })

  it('keeps the toolbar controls aligned with the deviation component naming', () => {
    expect(source).toContain(`:active-text="t('gnss.deviation.tracking')"`)
    expect(source).toContain(`{{ t('gnss.deviation.size') }}:`)
    expect(source).toContain(`t('gnss.deviation.resetLayout')`)
    expect(source).toContain(`t('gnss.deviation.clear')`)
    expect(source).not.toContain('gnss.map.follow')
    expect(source).not.toContain('gnss.map.slidingWindow')
    expect(source).toContain('function resetLayout(): void')
    expect(source).toContain('function updatePointSize(): void')
  })

  it('updates bounded polyline chunks instead of rebuilding the whole track', () => {
    expect(source).toContain('TRACK_SEGMENT_POINTS = 200')
    expect(source).toContain('lastSegment.line.addLatLng(point.latlng)')
    expect(source).toContain('for (const segment of touchedSegments) segment.line.setLatLngs(segment.latlngs)')
  })

  it('queues every precise GGA point and drains the queue across animation frames', () => {
    expect(source).toContain('const { mapTrackPoints } = useNmea()')
    expect(source).toContain('pendingTrackPoints.push(source[index])')
    expect(source).toContain('requestAnimationFrame(renderPendingTrack)')
    expect(source).toContain('TRACK_RENDER_BUDGET_MS = 4')
    expect(source).toContain('TRACK_BULK_POINTS_PER_FRAME = 4096')
    expect(source).toContain('appendTrackRange(pendingTrackHead, end)')
    expect(source).not.toContain('POSITION_UPDATE_INTERVAL_MS')
  })

  it('updates a rendered or queued tail when GGA replaces the same-epoch RMC point', () => {
    expect(source).toContain('lastObservedSourcePoint')
    expect(source).toContain('replaceLatestTrackPoint')
    expect(source).toContain('pendingTrackPoints[pendingIndex] = replacement')
    // 尾点此前被抽稀跳过时，替换样本重新排队而非强推渲染
    expect(source).toContain('pendingTrackPoints.push(replacement)')
    expect(source).toContain('simplifier?.replace(')
  })

  it('fits the complete imported track only when tracking is disabled during replay', () => {
    expect(source).toContain('function fitCompleteTrack()')
    expect(source).toContain('map.fitBounds(bounds')
    expect(source).toContain('fileTimeline.active.value && !isTracking.value')
  })

  it('disables Leaflet path simplification so displayed geometry retains every rendered point', () => {
    expect(source).toContain('smoothFactor: 0')
  })

  it('removes the previous position marker when replay resets the track', () => {
    expect(source).toContain('() => gnssStore.trackResetToken')
    expect(source).toMatch(
      /function resetTrackHistory\(\)[\s\S]*positionMarker\?\.remove\(\)[\s\S]*positionMarker = null/,
    )
  })

  it('renders simplified historical points with quality colors and detail tooltips', () => {
    expect(source).toContain('const historyPointMarkers: L.CircleMarker[] = []')
    expect(source).toContain('function addHistoryPoint(point: RenderedPoint)')
    expect(source).toContain('L.circleMarker(point.latlng')
    expect(source).toContain('fillColor: fixStatusColor(point.quality)')
    expect(source).toContain('marker.bindTooltip(historyPointTooltip(point')
    expect(source).toContain('numberToQuality(point.quality)')
    expect(source).toContain("t('gnss.map.historyPoint'")
    expect(source).toContain("t('gnss.map.longitude')")
    expect(source).toContain("t('gnss.map.latitude')")
    expect(source).toContain('historyMarker.setLatLng(replacementLatLng)')
    expect(source).toContain('historyMarker.setTooltipContent(')
    expect(source).toContain('for (const marker of historyPointMarkers) marker.remove()')
    expect(source).toContain('historyPointMarkers.length = 0')
  })
})
