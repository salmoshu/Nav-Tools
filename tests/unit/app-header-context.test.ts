import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('application header context file name', () => {
  const app = readFileSync('src/App.vue', 'utf8')
  const header = readFileSync('src/components/AppHeader.vue', 'utf8')

  it('surfaces the loaded file name for both LiDAR and GNSS apps', () => {
    expect(app).toContain("currentApplication.value?.id === 'lidar'")
    expect(app).toContain("currentApplication.value?.id === 'gnss'")
    // GNSS 取当前生效文件源的 basename，悬浮 title 给完整路径
    expect(app).toContain('mcapBasename(device.path)')
    expect(app).toContain("device.type === 'file' && device.path")
  })

  it('keeps the file name by the app name normally and by the panel title when fullscreen', () => {
    expect(header).toContain('v-if="contextFileName && !contextPanelTitle"')
    expect(header).toContain('v-if="contextFileName && contextPanelTitle"')
  })
})
