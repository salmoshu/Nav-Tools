// LiDAR 面板注册与集成的回归测试（源码扫描风格，对齐 layout-manager-persistence 等先例）。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { panelRegistry } from '../../src/core/panels/registry'
import { DEFAULT_APPLICATIONS } from '../../src/core/application/ApplicationStorage'

const read = (path: string) => readFileSync(path, 'utf8')

const LIDAR_PANEL_IDS = ['lidar-scene', 'lidar-scores', 'lidar-plot', 'lidar-inspector'] as const

describe('LiDAR 面板注册', () => {
  it('注册表包含全部 LiDAR 面板且指向正确组件', () => {
    for (const id of LIDAR_PANEL_IDS) {
      const panel = panelRegistry.find((entry) => entry.id === id)
      expect(panel, id).toBeDefined()
      expect(panel!.catalogGroup).toBe('lidar')
      expect(panel!.componentPath.startsWith('@/components/windows/lidar/')).toBe(true)
    }
    expect(panelRegistry.find((entry) => entry.id === 'lidar-scene')!.componentName).toBe(
      'LidarScene',
    )
  })

  it('两处 import.meta.glob 均包含 lidar 目录（漏加会导致面板加载失败）', () => {
    const layout = read('src/composables/useLayoutManager.ts')
    expect(layout).toContain("'../components/windows/lidar/*.vue'")
    const card = read('src/components/CardWindow.vue')
    expect(card).toContain("'./windows/lidar/*.vue'")
  })

  it('双语 panel 词条齐备', () => {
    for (const locale of ['zh-CN', 'en-US']) {
      const panel = read(`src/i18n/locales/${locale}/panel.ts`)
      for (const id of LIDAR_PANEL_IDS) {
        expect(panel).toContain(`'${id}'`)
      }
      const index = read(`src/i18n/locales/${locale}/index.ts`)
      expect(index).toContain("import lidar from './lidar'")
    }
  })

  it('默认应用含 LiDAR 且迁移键存在', () => {
    const lidar = DEFAULT_APPLICATIONS.find((application) => application.id === 'lidar')
    expect(lidar).toBeDefined()
    expect(lidar!.windowIds).toEqual([...LIDAR_PANEL_IDS])
    const storage = read('src/core/application/ApplicationStorage.ts')
    expect(storage).toContain('nav-tools:migration:lidar-default-v1')
  })

  it('preload 暴露 lidar IPC 方法', () => {
    const preload = read('electron/preload/index.ts')
    expect(preload).toContain(
      "lidarMcapReadFile: (path: string) => ipcRenderer.invoke('lidar-mcap-read-file', path)",
    )
    const main = read('electron/main/index.ts')
    expect(main).toContain('registerLidarIpc()')
  })

  it('回放控制合入数据接入：工具栏时间轴 + 统一文件输入 + 拖放分发', () => {
    // 工具栏挂载 LiDAR 时间轴（对齐 FileTimelineControl 形态）
    const toolbar = read('src/components/ToolBar.vue')
    expect(toolbar).toContain(
      '<LidarTimelineControl v-if="lidarTimelineActive" :position="position" />',
    )
    expect(toolbar).not.toContain('name="mcap"')
    expect(toolbar).toContain('handleInputSubmit')
    // 全窗口拖放 .mcap 走 mcapPlayer（多分片合并加载）
    const device = read('src/hooks/useDevice.ts')
    expect(device).toContain("endsWith('.mcap')")
    expect(device).toContain('mcapPlayer.loadFromFiles(mcapFiles)')
    // 时间轴控件接入播放器单例
    const timeline = read('src/components/LidarTimelineControl.vue')
    expect(timeline).toContain('useMcapPlayer')
    expect(timeline).toContain('player.stepFrames')
    // 诊断信息（话题表/会话指纹/快捷键）收进时间轴信息弹层——原回放控制面板内容不得丢失
    expect(timeline).toContain('lidar-info-popover')
    expect(timeline).toContain('lidar.playback.tabTopics')
    expect(timeline).toContain('player.setTopicVisible')
    // 双语时间轴词条
    for (const locale of ['zh-CN', 'en-US']) {
      const lidar = read(`src/i18n/locales/${locale}/lidar.ts`)
      expect(lidar).toContain('timeline:')
      expect(lidar).toContain('prevFrame')
    }
  })
})
