import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { panelRegistry } from '../../src/core/panels/registry'
import { getWindowById } from '../../src/settings/config'
import { componentBadgeSvg, recolorSvg } from '../../src/core/panels/componentIcon'

describe('componentIcon 组件图形解析', () => {
  it('注册表中的每个面板都能解析出组件图形 SVG（无纯 logo 退化）', () => {
    const missing: string[] = []
    for (const panel of panelRegistry) {
      const action = getWindowById(panel.id)?.action
      if (!action || !componentBadgeSvg(action)) missing.push(panel.id)
    }
    expect(missing).toEqual([])
  })

  it('同一应用内的面板组件图形两两不同（LiDAR / GNSS-Raw）', () => {
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

describe('buildComponentIconDataUrl 构图(源码扫描)', () => {
  const source = readFileSync('src/core/panels/componentIcon.ts', 'utf8')

  it('组件元素图标是主体:组色素描、176px 居中绘制,且先于角标', () => {
    const mainDraw = source.indexOf('const mainSize = 176')
    const badgeStart = source.indexOf('const badgeRadius = 41')
    expect(mainDraw).toBeGreaterThan(-1)
    expect(badgeStart).toBeGreaterThan(-1)
    expect(mainDraw).toBeLessThan(badgeStart)
    // 主体图形沿用组色单色素描化
    expect(source.slice(0, mainDraw)).toContain('recolorSvg(svg, color)')
    expect(source).toContain(
      'context.drawImage(icon, (size - mainSize) / 2, (size - mainSize) / 2, mainSize, mainSize)',
    )
  })

  it('Nav-Tools logo 缩为右下角角标:沿用白底圆 + 组色描边机制', () => {
    const badge = source.slice(source.indexOf('const badgeRadius = 41'))
    // 角标几何不变:半径 41,贴右下角
    expect(badge).toContain('const center = size - badgeRadius - 6')
    // 白底圆 + 组色描边,保证透明底 logo 在深浅背景都可辨
    expect(badge).toContain("context.fillStyle = '#ffffff'")
    expect(badge).toContain('context.strokeStyle = color')
    // 角标内绘制应用 logo 而非组件图形
    expect(badge).toContain('const logoSize = 52')
    expect(badge).toContain(
      'context.drawImage(logo, center - logoSize / 2, center - logoSize / 2, logoSize, logoSize)',
    )
    expect(badge).not.toContain('recolorSvg')
  })

  it('无专属图形或主体绘制失败时退化为 logo 整图,且不再叠加角标', () => {
    expect(source).toContain('let mainIsLogo = true')
    expect(source).toContain('if (mainIsLogo) {')
    expect(source).toContain('if (!mainIsLogo) {')
    // logo 加载失败的底色兜底保留
    expect(source).toContain("context.fillStyle = '#1f6feb'")
  })
})

describe('组件合成图标消费方接线(源码扫描)', () => {
  it('CardWindow 独立窗口把合成图标回传主进程设置任务栏/Alt+Tab 图标', () => {
    const cardWindow = readFileSync('src/components/CardWindow.vue', 'utf8')
    expect(cardWindow).toContain('buildComponentIconDataUrl(cardWindowId.value)')
    expect(cardWindow).toContain("invoke('set-component-window-icon', { dataUrl })")
  })

  it('App.vue 为独立窗口标题栏品牌位提供同一合成图标', () => {
    const app = readFileSync('src/App.vue', 'utf8')
    expect(app).toContain('buildComponentIconDataUrl(payload.windowId)')
    expect(app).toContain(':brand-icon-url="isCardWindow ? cardWindowIconUrl : undefined"')
  })

  it('AppHeader 品牌位优先显示合成图标,缺省回退应用 logo', () => {
    const header = readFileSync('src/components/AppHeader.vue', 'utf8')
    expect(header).toContain('brandIconUrl?: string')
    expect(header).toContain(":src=\"brandIconUrl || '/logo.svg'\"")
  })

  it('主进程窗口图标缓存与快捷方式 ICO 使用同一样式版本文件名(badge3)', () => {
    const main = readFileSync('electron/main/index.ts', 'utf8')
    const shortcuts = readFileSync('electron/main/shortcuts.ts', 'utf8')
    expect(main).toContain('`${windowId}-badge3.png`')
    expect(shortcuts).toContain('`${panel.id}-badge3.ico`')
    // 旧版本文件名不应残留,避免 Windows 图标缓存继续命中旧构图
    expect(main).not.toContain('badge2')
    expect(shortcuts).not.toContain('badge2')
  })
})
