import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  broadcastMetricViewport,
  subscribeMetricViewport,
} from '@/components/windows/gnss/metricViewportSync'

describe('metricViewportSync module channel', () => {
  it('delivers broadcasts to every subscriber with the payload', () => {
    const first = vi.fn()
    const second = vi.fn()
    const cancelFirst = subscribeMetricViewport(first)
    const cancelSecond = subscribeMetricViewport(second)

    const store = { id: 'position' }
    broadcastMetricViewport(3, 42, store)

    expect(first).toHaveBeenCalledWith({ start: 3, end: 42, store })
    expect(second).toHaveBeenCalledWith({ start: 3, end: 42, store })

    cancelFirst()
    broadcastMetricViewport(0, 10, store)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)

    cancelSecond()
  })

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn()
    const cancel = subscribeMetricViewport(listener)
    cancel()
    broadcastMetricViewport(1, 2, null)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('GnssMetricTimeSeries viewport sync wiring', () => {
  const source = readFileSync('src/components/windows/gnss/GnssMetricTimeSeries.vue', 'utf8')

  it('uses the module-scope broadcast channel, never a per-instance Set', () => {
    // 回归防护：<script setup> 顶层的 Set 每个组件实例各有一份，广播只到达自己，
    // E/N/U 联动因此失效；共享状态必须放在独立模块里
    expect(source).toContain("from './metricViewportSync'")
    expect(source).toContain('subscribeMetricViewport(handleViewportSync)')
    expect(source).toContain('broadcastMetricViewport(next.start, next.end, sourceStore.value)')
    expect(source).not.toContain('viewportSyncListeners')
    expect(source).not.toContain('new Set<')
  })
})
