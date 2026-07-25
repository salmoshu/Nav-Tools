import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applicationIconOptions } from '@/settings/applicationIcons'

const dialogFiles = [
  'src/components/ApplicationEditor.vue',
  'src/components/StatusBar.vue',
  'src/components/ToolBar.vue',
  'src/components/windows/motor/MotorConfig.vue',
  'src/components/windows/common/DeviationConfigDialog.vue',
  'src/components/windows/common/CameraParameters.vue',
  'src/components/windows/common/Plot.vue',
  'src/components/windows/common/plot/PlotConfigDialog.vue',
]

describe('dialog interaction policy', () => {
  it.each(dialogFiles)('%s closes from Escape and its backdrop', (path) => {
    const source = readFileSync(path, 'utf8')
    expect(source).toContain(':close-on-click-modal="true"')
    expect(source).toContain(':close-on-press-escape="true"')
    expect(source).toMatch(/class="[^"]*app-dialog[^"]*"/)
  })

  it('keeps confirmation dialogs dismissible too', () => {
    for (const path of [
      'src/components/ApplicationSelector.vue',
      'src/components/StatusBar.vue',
      'src/components/windows/motor/MotorConfig.vue',
    ]) {
      const source = readFileSync(path, 'utf8')
      const confirmationCount = source.match(/ElMessageBox\.confirm\(/g)?.length ?? 0
      expect(source.match(/closeOnClickModal: true/g)).toHaveLength(confirmationCount)
      expect(source.match(/closeOnPressEscape: true/g)).toHaveLength(confirmationCount)
      expect(source.match(/customClass: 'app-message-box'/g)).toHaveLength(confirmationCount)
    }
  })

  it('offers a broad application icon catalog', () => {
    expect(applicationIconOptions.length).toBeGreaterThanOrEqual(20)
  })

  it('does not intercept Escape inside the data input dialog', () => {
    const toolbar = readFileSync('src/components/ToolBar.vue', 'utf8')
    expect(toolbar).not.toContain('@keydown.stop')
    expect(toolbar).toContain('handleInputDialogEscape')
  })

  it('disables browser spellchecking in data input fields', () => {
    const toolbar = readFileSync('src/components/ToolBar.vue', 'utf8')
    expect(toolbar).toContain('.data-input-dialog input, .data-input-dialog textarea')
    expect(toolbar).toContain('element.spellcheck = false')
  })

  it('offers RTKLIB time-tag playback controls and timestamped log recording', () => {
    const toolbar = readFileSync('src/components/ToolBar.vue', 'utf8')
    expect(toolbar).toContain('v-model="fileTimeTag"')
    expect(toolbar).toContain('v-model="fileReplaySpeed"')
    expect(toolbar).toContain('v-model="fileStartOffset"')
    expect(toolbar).toContain('v-model="filePositionBytes"')
    expect(toolbar).toContain('toggleLogRecording()')
    expect(toolbar).toContain('log-record-button')
    expect(toolbar.indexOf('label="文件输入"')).toBeLessThan(toolbar.indexOf('label="串口连接"'))
  })

  it('uses dedicated catalog groups without changing panel data modes', () => {
    const editor = readFileSync('src/components/ApplicationEditor.vue', 'utf8')
    expect(editor).toContain('windowDefinition.catalogGroup')
    expect(editor).toContain("camera: 'Camera'")
  })

  it('separates motor configuration tools from dialog submission actions', () => {
    const source = readFileSync('src/components/windows/motor/MotorConfig.vue', 'utf8')
    const footer = source.match(/<template #footer>([\s\S]*?)<\/template>\s*<\/el-dialog>/)?.[1]

    expect(source).toContain('class="config-tool-card"')
    expect(source).toContain(':before-close="handleDialogBeforeClose"')
    expect(footer).toContain('取消')
    expect(footer).toContain('确定')
    expect(footer).not.toMatch(/载入配置|导出配置|恢复默认/)
  })
})
