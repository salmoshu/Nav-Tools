import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Dashboard fullscreen toolbar/statusbar deferred hide', () => {
  const source = readFileSync('src/components/Dashboard.vue', 'utf8')

  it('renders toolbar/statusbar via deferred rendered refs instead of raw show flags', () => {
    // v-if 使用延迟渲染状态，而非直接使用用户开关状态
    expect(source).toContain('v-if="toolbarRendered"')
    expect(source).toContain('v-if="statusbarRendered"')
    // 不再直接用 showToolBar/showStatusBar 控制 v-if
    expect(source).not.toContain('v-if="showToolBar"')
    expect(source).not.toContain('v-if="showStatusBar"')
  })

  it('defers toolbar removal by two animation frames in fullscreen mode', () => {
    // 全屏模式下隐藏 toolbar 时，等待两帧让全屏卡片先拉伸到位
    expect(source).toContain('toolbarRendered')
    expect(source).toContain('requestAnimationFrame')
    // 非全屏时立即移除
    expect(source).toContain('fullScreenItem.value === null')
  })

  it('defers statusbar removal the same way as toolbar', () => {
    expect(source).toContain('statusbarRendered')
    // statusbar 的延迟隐藏逻辑与 toolbar 一致
    const watchBlock = source.slice(
      source.indexOf('watch(showStatusBar'),
      source.indexOf('// 提供工具栏和状态栏位置的响应式引用'),
    )
    expect(watchBlock).toContain('requestAnimationFrame')
    expect(watchBlock).toContain('fullScreenItem.value === null')
  })

  it('syncs rendered state immediately when exiting fullscreen', () => {
    // 退出全屏时立即同步渲染状态，避免延迟隐藏中的 toolbar/statusbar 与内容重叠
    const exitBlock = source.slice(
      source.indexOf('const exitFullScreen'),
      source.indexOf('// 切换卡片全屏状态'),
    )
    expect(exitBlock).toContain('toolbarRendered.value = showToolBar.value !== false')
    expect(exitBlock).toContain('statusbarRendered.value = showStatusBar.value !== false')
  })

  it('keeps fullscreen card positioning driven by user toggle state', () => {
    // dashboardStyle 基于 showToolBar/showStatusBar 计算，确保全屏卡片位置立即响应
    const styleBlock = source.slice(
      source.indexOf('const dashboardStyle'),
      source.indexOf('// 计算内容区域的样式'),
    )
    expect(styleBlock).toContain('showStatusBar.value')
    expect(styleBlock).toContain('showToolBar.value === true')
  })
})
