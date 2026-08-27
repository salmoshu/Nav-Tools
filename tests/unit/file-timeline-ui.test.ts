import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('file timeline presentation', () => {
  const timeline = readFileSync('src/components/FileTimelineControl.vue', 'utf8')
  const metric = readFileSync('src/components/windows/gnss/GnssMetricTimeSeries.vue', 'utf8')
  const satellites = readFileSync('src/components/windows/gnss/SatelliteCountChart.vue', 'utf8')
  const messages = readFileSync('src/components/windows/common/RawMessages.vue', 'utf8')

  it('renders a polished slider with a visible played portion', () => {
    expect(timeline).toContain("'--timeline-progress': `${progress}%`")
    expect(timeline).toContain('.timeline-slider::-webkit-slider-runnable-track')
    expect(timeline).toContain('.timeline-slider::-webkit-slider-thumb')
    expect(timeline).toContain('.timeline-slider::-moz-range-progress')
  })

  it('hides future chart samples only during replay mode', () => {
    for (const source of [metric, satellites]) {
      expect(source).toContain("fileTimeline.mode.value === 'replay'")
      expect(source).toContain('fileTimeline.elapsedMilliseconds.value')
      expect(source).toContain('findNearestElapsedTime')
    }
  })

  it('keeps file messages on mount and follows the timeline cursor', () => {
    expect(messages).toContain('if (!fileTimeline.active.value && !fileTimeline.indexing.value)')
    expect(messages).toContain('fileTimeline.elapsedMilliseconds.value')
    expect(messages).toContain('scrollToTimelineMessage()')
    expect(messages).toContain('scrollerRef.value.scrollToItem(targetIndex)')
  })
})
