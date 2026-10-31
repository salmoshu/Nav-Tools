/* eslint-disable vue/one-component-per-file -- Test host and presentation-only stubs share this fixture. */
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LidarTimelineControl from '../../src/components/LidarTimelineControl.vue'
import { useLidarPanelPresence, useMcapPlayer } from '../../src/composables/useMcapPlayer'
import { i18n } from '../../src/i18n'
import type { PlannerState } from '../../src/core/lidar/PlannerState'
import {
  buildMcapBytes,
  makeLaserScan,
  makeString,
  makeTwist,
  SCHEMA_LASER_SCAN,
  SCHEMA_STRING,
  SCHEMA_TWIST,
  type BagChannelInput,
} from './helpers/lidarTestBag'

// Icons are presentation-only; keep this test on the real player, reader and Vue timeline.
vi.mock('@element-plus/icons-vue', () => {
  const icon = { render: () => null }
  return Object.fromEntries(
    [
      'ArrowLeft',
      'ArrowRight',
      'Clock',
      'Close',
      'Document',
      'InfoFilled',
      'RefreshRight',
      'VideoPause',
      'VideoPlay',
    ].map((name) => [name, icon]),
  )
})
vi.mock('element-plus', async () => {
  const { h, defineComponent } = await import('vue')
  return {
    ElIcon: defineComponent({
      setup(_, { slots }) {
        return () => h('span', slots.default?.())
      },
    }),
  }
})

const BASE = 1_000_000_000n
const at = (ms: number) => BASE + BigInt(ms) * 1_000_000n
const player = useMcapPlayer()

function state(frame: number): PlannerState {
  return {
    frame,
    enabled: true,
    success: true,
    has_observation: false,
    has_pose: true,
    has_scan_pose: true,
    scan_capture_valid: false,
    scan_capture_ns: null,
    scan_pose_ns: '1000000000',
    pose_ns: '1000000000',
    processing_start_ns: '1000000000',
    command_ns: '1000000000',
    command_done_ns: '1000000000',
    source: 'navigation_hold',
    cmd: { v: 0, w: 0 },
    dispatch: { sink_present: true, attempted: true, accepted: true, state: 'ok' },
    local_map: {
      active: true,
      blk: true,
      nav_hold: true,
      nav_reason: 'target_lost_route_wait',
      memory_paused: false,
    },
    wheel: { known: true, present: true, fresh: true, sequence: '1', age_ms: 1 },
    target: { known: true, present: true, fresh: false, sequence: '1', age_ms: 500 },
    bypass: {
      attempted: true,
      search_ns: '1000000000',
      found: false,
      complete: false,
      reason: 'boundary_terminal_unavailable',
      start_unknown: false,
      start_occupied: false,
      start_clearance_blocked: false,
      goal_outside_window: false,
      goal_unknown: false,
      goal_clearance_blocked: false,
      terminal_candidates: 0,
      terminal_unknown: 0,
      terminal_clearance_blocked: 0,
      terminal_disconnected: 0,
      terminal_footprint_blocked: 0,
      reachable_cells: 0,
    },
  }
}

async function loadSample(options: { planner?: boolean; scan?: boolean } = {}): Promise<void> {
  const channels: BagChannelInput[] = [
    {
      topic: '/cmd_raw',
      schemaName: 'geometry_msgs/msg/Twist',
      schemaText: SCHEMA_TWIST,
      messages: [10, 110, 210].map((ms) => ({ logTimeNs: at(ms), message: makeTwist(0, 0) })),
    },
  ]
  if (options.scan !== false) {
    for (const [topic, offset] of [
      ['/scan_raw', 0],
      ['/scan_filtered', 2],
    ] as const) {
      channels.push({
        topic,
        schemaName: 'sensor_msgs/msg/LaserScan',
        schemaText: SCHEMA_LASER_SCAN,
        messages: [0, 100, 200].map((ms) => ({
          logTimeNs: at(ms + offset),
          message: makeLaserScan('laser', 1, ms * 1_000_000, [1, 2]),
        })),
      })
    }
  }
  if (options.planner !== false) {
    channels.push({
      topic: '/planner_state',
      schemaName: 'std_msgs/msg/String',
      schemaText: SCHEMA_STRING,
      messages: [11, 12, 14].map((frame, index) => ({
        logTimeNs: at(20 + index * 100),
        message: makeString(JSON.stringify(state(frame))),
      })),
    })
  }
  const bytes = await buildMcapBytes(channels)
  const file = new File([bytes], 'sample.mcap')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.slice().buffer })
  expect(await player.loadFromFiles([file])).toBe(true)
}

let mounted: App | undefined
let host: HTMLDivElement

function mountTimeline(position: 'bottom' | 'left' = 'bottom'): void {
  host = document.createElement('div')
  document.body.append(host)
  mounted = createApp(
    defineComponent({
      setup() {
        useLidarPanelPresence()
        return () => h(LidarTimelineControl, { position })
      },
    }),
  )
  for (const name of [
    'ElTag',
    'ElTooltip',
    'ElTableColumn',
    'ElSwitch',
    'ElTable',
    'ElTabPane',
    'ElTabs',
  ]) {
    mounted.component(name, { render: () => null })
  }
  mounted.mount(host)
}

function button(title: string, root: Element | Document = host): HTMLButtonElement {
  const element = root.querySelector<HTMLButtonElement>(`button[title="${title}"]`)
  expect(element, title).not.toBeNull()
  return element!
}

async function selectMode(mode: string, root: Element | Document = host): Promise<void> {
  const select = root.querySelector<HTMLSelectElement>('.timeline-step-mode')!
  expect(select).not.toBeNull()
  select.value = mode
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

beforeEach(() => {
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  player.pause()
  player.setStepMode?.('planner')
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  player.pause()
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('LiDAR playback timeline', () => {
  it('shows time and planner counts without adding one, including original noncontiguous frame IDs', async () => {
    await loadSample()
    mountTimeline()
    // 横向时间只留已播放(完整区间在 title),计数区只留数字(帧定义在 title)
    expect(host.querySelector('.timeline-time')?.textContent).toBe('00:00.000')
    expect(host.querySelector('.timeline-time')?.getAttribute('title')).toBe('00:00.000 / 00:00.220')
    expect(host.querySelector('.timeline-epoch')?.textContent).toBe('0/3')
    expect(host.querySelector('.timeline-epoch')?.getAttribute('title')).toContain('规划帧 0 / 3')
    expect(button('上一步').disabled).toBe(true)
    expect(button('下一步').disabled).toBe(false)

    player.seek(Number(at(20)))
    await nextTick()
    expect(host.querySelector('.timeline-epoch')?.textContent).toBe('1/3')
    expect(host.querySelector('.timeline-epoch')?.getAttribute('title')).toContain('规划编号 11')
    expect(button('上一步').disabled).toBe(true)

    player.seek(Number(at(220)))
    await nextTick()
    expect(host.querySelector('.timeline-epoch')?.textContent).toBe('3/3')
    expect(host.querySelector('.timeline-epoch')?.getAttribute('title')).toContain('规划编号 14')
    expect(button('下一步').disabled).toBe(true)
  })

  it('steps between planner snapshots including hold frames, independently of other topic events', async () => {
    await loadSample()
    mountTimeline()
    button('下一步').click()
    await nextTick()
    expect(player.playheadNs.value).toBe(Number(at(20)))
    expect(player.currentPlannerState.value?.frame).toBe(11)
    button('下一步').click()
    await nextTick()
    expect(player.playheadNs.value).toBe(Number(at(120)))
    expect(player.currentPlannerState.value?.frame).toBe(12)
    expect(player.currentScores.value).toBeUndefined()
  })

  it('switches among planner frames, raw scans and event points without moving the playhead', async () => {
    await loadSample()
    player.seek(Number(at(20)))
    mountTimeline()
    await selectMode('scan')
    expect(player.playheadNs.value).toBe(Number(at(20)))
    expect(host.querySelector('.timeline-epoch')?.textContent).toBe('1/3')
    expect(host.querySelector('.timeline-epoch')?.getAttribute('title')).toContain('雷达帧 1 / 3')
    expect(button('上一步').disabled).toBe(false)
    button('下一步').click()
    await nextTick()
    expect(player.playheadNs.value).toBe(Number(at(100)))
    await selectMode('events')
    button('下一步').click()
    await nextTick()
    expect(player.playheadNs.value).toBe(Number(at(102)))
    expect(host.querySelector('.timeline-epoch')?.textContent).toBe('6/12')
    expect(host.querySelector('.timeline-epoch')?.getAttribute('title')).toContain('事件时间点 6 / 12')
    expect(host.querySelector('.timeline-planner-number')).toBeNull()
  })

  it('steps strictly backward from between frames and clamps multi-step shortcuts at both ends', async () => {
    await loadSample()
    mountTimeline()
    player.seek(Number(at(70)))
    player.stepFrames(-1)
    expect(player.playheadNs.value).toBe(Number(at(20)))
    player.stepFrames(10)
    expect(player.playheadNs.value).toBe(Number(at(220)))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }))
    expect(player.playheadNs.value).toBe(Number(at(20)))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(player.playheadNs.value).toBe(Number(at(120)))
  })

  it('falls back to scans and then events for older recordings, returning to planner when available', async () => {
    await loadSample({ planner: false })
    mountTimeline()
    expect(player.stepMode.value).toBe('scan')
    expect(player.stepTotal.value).toBe(3)
    const option = host.querySelector<HTMLOptionElement>(
      '.timeline-step-mode option[value="planner"]',
    )!
    expect(option.disabled).toBe(true)
    await loadSample({ planner: false, scan: false })
    expect(player.stepMode.value).toBe('events')
    expect(player.stepTotal.value).toBe(3)
    await loadSample()
    expect(player.stepMode.value).toBe('planner')
  })

  it('keeps continuous playback time-based across mode changes and pauses for single-step inspection', async () => {
    await loadSample()
    player.play()
    const raf = vi.mocked(requestAnimationFrame)
    raf.mock.calls.at(-1)![0](100)
    raf.mock.calls.at(-1)![0](150)
    expect(player.playheadNs.value).toBe(Number(at(50)))
    player.setStepMode('scan')
    expect(player.playing.value).toBe(true)
    expect(player.playheadNs.value).toBe(Number(at(50)))
    player.stepFrames(1)
    expect(player.playing.value).toBe(false)
    expect(player.playheadNs.value).toBe(Number(at(100)))
    player.seek(Number(at(200)))
    player.play()
    player.stepFrames(1)
    expect(player.playing.value).toBe(false)
    expect(player.playheadNs.value).toBe(Number(at(200)))
  })

  it('exposes the same source selector and correct counters in the vertical popover', async () => {
    await loadSample()
    mountTimeline('left')
    host.querySelector<HTMLButtonElement>('.timeline-trigger')!.click()
    await nextTick()
    const popover = document.querySelector('.timeline-popover')!
    expect(popover).not.toBeNull()
    await selectMode('events', popover)
    expect(popover.querySelector('.timeline-epoch')?.textContent).toBe('1/12')
    expect(popover.querySelector('.timeline-epoch')?.getAttribute('title')).toContain('事件时间点 1 / 12')
    player.seek(player.document.value!.endNs!)
    await nextTick()
    expect(popover.querySelector('.timeline-epoch')?.textContent).toBe('12/12')
    expect(popover.querySelector('.timeline-epoch')?.getAttribute('title')).toContain('事件时间点 12 / 12')
    expect(button('下一步', popover).disabled).toBe(true)
  })
})
