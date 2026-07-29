import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mapSource = readFileSync('src/components/windows/gnss/GnssMap.vue', 'utf8')
const deviationSource = readFileSync('src/components/windows/gnss/GnssDeviation.vue', 'utf8')

describe('GNSS default tracking', () => {
  it('starts Map follow enabled and does not disable it for file timelines', () => {
    expect(mapSource).toContain('const follow = ref(true)')
    expect(mapSource).not.toContain('if (active) follow.value = false')
    expect(mapSource).toContain(
      'fileTimeline.active.value && !slidingWindow.value && !follow.value',
    )
  })

  it('starts Deviation tracking enabled and preserves it while importing file data', () => {
    expect(deviationSource).toContain('const isTracking = ref(true)')
    expect(deviationSource).not.toContain('isTracking.value = false')
    expect(deviationSource).toContain('fileTimeline.active.value &&')
    expect(deviationSource).toContain('!isTracking.value &&')
  })
})
