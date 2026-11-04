import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('update dialog action buttons', () => {
  it('stretches the two buttons to fill the row symmetrically', () => {
    const source = readFileSync('src/components/UpdateDialog.vue', 'utf8')

    expect(source).not.toContain('justify-content: flex-start')
    expect(source).toContain('.update-dialog-actions .el-button')
    expect(source).toContain('flex: 1')
    // 间距走容器 gap，清掉 Element Plus 相邻按钮默认边距避免与 gap 叠加
    expect(source).toContain('margin-left: 0')
  })
})
