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
  'src/components/windows/common/CameraVideo.vue',
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
    expect(toolbar).toContain('v-model="replaySpeedSelection"')
    expect(toolbar).toContain('fileTimeTag.value = false')
    expect(toolbar).toContain('fileReplaySpeed.value = value')
    expect(toolbar).toContain('v-model="fileStartOffset"')
    expect(toolbar).toContain('v-model="filePositionBytes"')
    expect(toolbar).toContain('toggleLogRecording()')
    expect(toolbar).toContain('log-record-button')
    expect(toolbar.indexOf("t('app.toolbar.fileTab')")).toBeLessThan(
      toolbar.indexOf("t('app.toolbar.serialTab')"),
    )
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
    expect(footer).toContain("t('motor.cancel')")
    expect(footer).toContain("t('motor.confirm')")
    expect(footer).not.toMatch(/loadConfig|exportConfig|resetToDefault/)
  })

  it('keeps Plot, Hex, and Deviation configuration select menus above their dialogs', () => {
    const style = readFileSync('src/style.css', 'utf8')
    const plot = readFileSync('src/components/windows/common/plot/PlotConfigDialog.vue', 'utf8')
    const motor = readFileSync('src/components/windows/motor/MotorConfig.vue', 'utf8')
    const deviation = readFileSync(
      'src/components/windows/common/DeviationConfigDialog.vue',
      'utf8',
    )
    const motorSelectTags = motor.match(/<el-select\b[\s\S]*?>/g) ?? []
    const deviationSelectTags = deviation.match(/<el-select\b[\s\S]*?>/g) ?? []

    expect(style).toContain('.app-dialog-select-popper')
    expect(style).toContain('z-index: 8002 !important')
    expect(plot).toContain('popper-class="app-dialog-select-popper"')
    expect(motorSelectTags.length).toBeGreaterThan(0)
    expect(
      motorSelectTags.every((tag) => tag.includes('popper-class="app-dialog-select-popper"')),
    ).toBe(true)
    expect(deviationSelectTags).toHaveLength(2)
    expect(
      deviationSelectTags.every((tag) =>
        tag.includes('popper-class="app-dialog-select-popper"'),
      ),
    ).toBe(true)
  })

  it('uses a generic command configuration title for the Hex dialog', () => {
    const zh = readFileSync('src/i18n/locales/zh-CN/motor.ts', 'utf8')
    const en = readFileSync('src/i18n/locales/en-US/motor.ts', 'utf8')

    expect(zh).toContain("dialogTitle: '指令配置（16进制）'")
    expect(zh).toContain("dialogTitleMain: '指令配置'")
    expect(zh).not.toContain('电机驱动指令配置')
    expect(en).toContain("dialogTitle: 'Command Configuration (Hex)'")
    expect(en).toContain("dialogTitleMain: 'Command Configuration'")
  })

  it('restores the last confirmed data source tab when reopening the input dialog', () => {
    const device = readFileSync('src/hooks/useDevice.ts', 'utf8')
    // 未指定 tab 打开弹框时回到 activeSource，未确认的 tab 切换不留存
    expect(device).toContain('activeTab.value = dataSourceSettings.activeSource')
  })
})
