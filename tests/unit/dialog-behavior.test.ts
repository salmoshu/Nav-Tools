import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applicationIconOptions } from '@/settings/applicationIcons'

const dialogFiles = [
  'src/components/ApplicationEditor.vue',
  'src/components/StatusBar.vue',
  'src/components/ToolBar.vue',
  'src/components/windows/motor/MotorConfig.vue',
  'src/components/windows/common/DeviationConfigDialog.vue',
  'src/components/windows/common/Plot.vue',
  'src/components/windows/common/plot/PlotConfigDialog.vue',
]

describe('dialog interaction policy', () => {
  it.each(dialogFiles)('%s closes from Escape and its backdrop', (path) => {
    const source = readFileSync(path, 'utf8')
    expect(source).toContain(':close-on-click-modal="true"')
    expect(source).toContain(':close-on-press-escape="true"')
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
})
