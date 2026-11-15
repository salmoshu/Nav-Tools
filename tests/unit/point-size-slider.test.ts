import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const components = [
  'src/components/windows/gnss/GnssDeviation.vue',
  'src/components/windows/gnss/GnssMap.vue',
  'src/components/windows/common/Deviation.vue',
]

describe('trajectory point-size sliders', () => {
  it.each(components)('%s restores the default size from its slider button', (path) => {
    const source = readFileSync(path, 'utf8')
    expect(source).toContain('const DEFAULT_POINT_SIZE = 10')
    expect(source).toContain('@dblclick="resetPointSize"')
    expect(source).toMatch(/(?:mapPointSize|pointSize)\.value = DEFAULT_POINT_SIZE/)
    expect(source).toContain('.el-slider__button-wrapper, .el-slider__button')
  })
})
