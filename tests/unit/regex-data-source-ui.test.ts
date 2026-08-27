import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  textDataParserCascaderOptions,
  textDataParserOptions,
} from '@/composables/useDataSourceManager'
import { t } from '@/i18n'

describe('regex data-source UI integration', () => {
  const toolbar = readFileSync('src/components/ToolBar.vue', 'utf8')
  const device = readFileSync('src/hooks/useDevice.ts', 'utf8')
  const messages = readFileSync('src/components/windows/common/RawMessages.vue', 'utf8')

  it('offers Regex as a persisted parser option', () => {
    expect(textDataParserOptions.map((option) => option.value)).toContain('regex')
    expect(textDataParserOptions.map((option) => option.value)).toContain('csv')
    expect(toolbar.match(/v-model="sourceRegexPattern"/g)).toHaveLength(3)
    expect(toolbar).toContain("sourceParser === 'regex'")
    expect(device).toContain('sourceRegexPattern')
  })

  it('renders parser options as cascader submenus with three parser-selects', () => {
    expect((toolbar.match(/el-cascader/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(toolbar).toContain('textDataParserCascaderOptions')
  })

  it('keeps 无 as a first-level leaf and groups the rest into submenus', () => {
    const regexOption = textDataParserOptions.find((option) => option.value === 'regex')
    // 正则名称走 i18n：中文「正则表达式」，英文 Regular Expression
    expect(regexOption?.label).toBe(t('app.toolbar.regexPattern'))

    const first = textDataParserCascaderOptions[0]
    expect(first).toMatchObject({ value: 'raw', label: '无' })
    expect(first?.children).toBeUndefined()

    const grouped = textDataParserCascaderOptions.slice(1)
    expect(grouped.map((option) => option.value)).toEqual(['structured', 'protocol', 'custom'])
    expect(
      grouped
        .find((option) => option.value === 'structured')
        ?.children?.map((child) => child.value),
    ).toEqual(['json', 'csv'])
  })

  it('routes the active regex definition to Flow and Messages', () => {
    expect(device).toContain('addFlowData(data, activeDataParser.value, activeRegexPattern.value)')
    expect(device).toContain('flowRegexPattern.value = regexPattern')
    expect(messages).toContain("activeDataParser.value === 'raw' ? 'none' : activeDataParser.value")
  })

  it('renames the raw parser label to 无 and wires the parser-config highlight', () => {
    const rawOption = textDataParserOptions.find((option) => option.value === 'raw')
    expect(rawOption?.label).toBe('无')

    expect(messages).toContain('highlight-parser-format')
    expect(messages).toContain('openParserConfig')
    // useDevice 状态非单例，徽标必须经 input-event 由 ToolBar 实例打开弹框
    expect(messages).toContain("emitter.emit('input-event')")

    expect(toolbar).toContain('parser-flash')
    expect(toolbar).toContain('parser-flash-pulse')
    expect(toolbar).toContain("emitter.on('highlight-parser-format'")
  })
})
