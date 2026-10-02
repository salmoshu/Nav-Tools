import { describe, expect, it } from 'vitest'
import { panelRegistry } from '../../src/core/panels/registry'
import { getWindowById } from '../../src/settings/config'
import { componentBadgeSvg, recolorSvg } from '../../src/core/panels/componentIcon'

describe('componentIcon 角标图形解析', () => {
  it('注册表中的每个面板都能解析出角标 SVG（无纯 logo 退化）', () => {
    const missing: string[] = []
    for (const panel of panelRegistry) {
      const action = getWindowById(panel.id)?.action
      if (!action || !componentBadgeSvg(action)) missing.push(panel.id)
    }
    expect(missing).toEqual([])
  })

  it('同一应用内的面板角标图形两两不同（LiDAR / GNSS-Raw）', () => {
    for (const group of ['lidar', 'gnssraw'] as const) {
      const svgs = panelRegistry
        .filter((panel) => panel.catalogGroup === group)
        .map((panel) => componentBadgeSvg(getWindowById(panel.id)!.action))
      expect(new Set(svgs).size).toBe(svgs.length)
    }
  })
})

describe('recolorSvg 单色素描化', () => {
  it('替换全部非 none 填充为指定颜色', () => {
    const out = recolorSvg(
      '<svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z" fill="#F2F2F2"/><path d="M1 1h2v2H1z" fill="none"/></svg>',
      '#16a34a',
    )
    expect(out).toContain('fill="#16a34a"')
    expect(out).toContain('fill="none"')
    expect(out).not.toContain('#F2F2F2')
  })

  it('根节点无 fill 时补上（靠根 fill 继承的内联图标）', () => {
    const out = recolorSvg('<svg viewBox="0 0 16 16"><path d="M0 0h8v8H0z"/></svg>', '#2563eb')
    expect(out).toContain('<svg fill="#2563eb"')
  })

  it('根节点已有 fill 时不重复插入', () => {
    const out = recolorSvg('<svg fill="#000000" viewBox="0 0 16 16"><path d="M0 0h8v8H0z"/></svg>', '#9333ea')
    expect(out).toContain('<svg fill="#9333ea"')
    expect(out.match(/<svg/g)).toHaveLength(1)
  })
})
