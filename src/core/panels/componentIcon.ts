import { getWindowById } from '@/settings/config'
import { toolBarIcon } from '@/settings/icons'
import { applicationIconComponents } from '@/settings/applicationIcons'
import { getPanelById, type PanelCatalogGroup } from '@/core/panels/registry'

/**
 * 面板 action 没有专属图标时的借用表（同一查找链：先 toolBarIcon 内联 SVG，
 * 后 applicationIconComponents 的 element-plus 图标）。保证每个组件都有
 * 与其特性相关的专属图形，而不是退化成纯应用 logo。
 */
const ACTION_BADGE_FALLBACK: Record<string, string> = {
  terminal: 'monitor',
  'lidar-plot': 'trend',
  'lidar-scores': 'gauge',
  'lidar-inspector': 'data',
  'gnssraw-frames': 'data',
  'gnssraw-visibility': 'satellite',
  'gnssraw-gf': 'trend',
  'gnssraw-prnoise': 'chart',
  'gnssraw-snr': 'signal',
  'gnssraw-eph': 'compass',
}

/** 组件图形与角标描边配色按组件所属应用分组（registry 的 catalogGroup），桌面上一眼区分应用家族 */
const GROUP_BADGE_COLORS: Record<PanelCatalogGroup, string> = {
  general: '#475569',
  flow: '#475569',
  gnss: '#16a34a',
  camera: '#2563eb',
  lidar: '#9333ea',
  gnssraw: '#0d9488',
}

/** 按图标键查找 SVG 文档字符串：toolBarIcon 内联 SVG → element-plus 图标组件提取 path */
function lookupIconSvg(key: string): string | undefined {
  const raw = toolBarIcon[key as keyof typeof toolBarIcon]
  if (typeof raw === 'string') return raw

  const paths = extractElementIconPaths(
    applicationIconComponents[key as keyof typeof applicationIconComponents],
  )
  if (paths.length === 0) return undefined
  return (
    `<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">` +
    paths.map((path) => `<path d="${path}"/>`).join('') +
    `</svg>`
  )
}

/** 面板 action → 组件图形 SVG（合成图标的主体）：专属图标优先，缺失时按 ACTION_BADGE_FALLBACK 借用 */
export function componentBadgeSvg(action: string): string | undefined {
  const direct = lookupIconSvg(action)
  if (direct) return direct
  const fallback = ACTION_BADGE_FALLBACK[action]
  return fallback ? lookupIconSvg(fallback) : undefined
}

/** element-plus 图标组件是 setup 型组件：setup() 返回渲染函数；
 *  兼容直接带 render 的组件。render 出 svg vnode 后从 path 子节点收集 d 属性 */
function extractElementIconPaths(component: unknown): string[] {
  try {
    const comp = component as { render?: unknown; setup?: unknown } | undefined
    let render = comp?.render
    if (typeof render !== 'function' && typeof comp?.setup === 'function') {
      render = (comp.setup as (this: unknown, ...args: unknown[]) => unknown).call(comp, {}, {})
    }
    if (typeof render !== 'function') return []
    const vnode = (render as (this: unknown) => { children?: unknown }).call(
      component as object,
    )
    const children = Array.isArray(vnode?.children) ? (vnode.children as unknown[]) : []
    const paths: string[] = []
    for (const child of children) {
      const d = (child as { props?: { d?: unknown } } | null)?.props?.d
      if (typeof d === 'string' && d) paths.push(d)
    }
    return paths
  } catch {
    return []
  }
}

/**
 * 单色素描化：把 SVG 内所有非 none 填充统一为指定颜色。
 * toolBarIcon 的内联 SVG 是深色工具栏配色（多为 #F2F2F2），直接画在白底
 * 角标上近乎隐形；统一改成组色后既保证可辨，也让同族组件角标色彩一致。
 */
export function recolorSvg(svg: string, color: string): string {
  let out = svg.replace(/fill="(?!none")[^"]*"/g, `fill="${color}"`)
  // 根节点无 fill 时补上（部分内联图标靠根 fill 继承）
  if (!/<svg[^>]*\sfill=/.test(out)) out = out.replace(/<svg/, `<svg fill="${color}"`)
  return out
}

/**
 * 合成组件图标:组件元素图标为主体(组色单色素描,居中撑满画面),
 * Nav-Tools logo 缩为右下角角标(白底圆 + 组色描边),输出 256px PNG
 * data URL。桌面快捷方式由主进程封装成 .ico 供 .lnk 使用;组件独立
 * 窗口的标题栏/任务栏图标也复用同一合成结果。
 */
export async function buildComponentIconDataUrl(windowId: string): Promise<string> {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建画布')

  const definition = getWindowById(windowId)
  const panel = getPanelById(windowId)
  const color = GROUP_BADGE_COLORS[panel?.catalogGroup ?? 'general'] ?? GROUP_BADGE_COLORS.general
  const svg = definition ? componentBadgeSvg(definition.action) : undefined
  const logoUrl = new URL('logo_transparent.png', document.baseURI).href

  // 主体:组件元素图标(单色素描化为组色)居中撑满;无专属图形或绘制
  // 失败时退化为应用 logo 整图,此时右下角角标冗余,不再叠加
  let mainIsLogo = true
  if (svg) {
    try {
      const icon = await loadImage(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(recolorSvg(svg, color))}`,
      )
      // svg 自带 16/24px 尺寸,统一按目标框缩放绘制;轻微投影让图形在深浅壁纸上都能分离
      const mainSize = 176
      context.save()
      context.shadowColor = 'rgba(0, 0, 0, 0.35)'
      context.shadowBlur = 6
      context.shadowOffsetY = 2
      context.drawImage(icon, (size - mainSize) / 2, (size - mainSize) / 2, mainSize, mainSize)
      context.restore()
      mainIsLogo = false
    } catch {
      mainIsLogo = true
    }
  }
  if (mainIsLogo) {
    // 退化底图:应用 logo;加载失败也要给出底色版图标
    try {
      const logo = await loadImage(logoUrl)
      context.drawImage(logo, 0, 0, size, size)
    } catch {
      context.fillStyle = '#1f6feb'
      context.fillRect(0, 0, size, size)
    }
  }

  if (!mainIsLogo) {
    // 角标沿用旧构图的几何:半径 41 贴右下角,白底圆 + 组色描边 + 轻微
    // 投影;透明底 logo 落在白圆上,深浅壁纸/深浅主题下都可辨
    const badgeRadius = 41
    const center = size - badgeRadius - 6
    context.save()
    context.shadowColor = 'rgba(0, 0, 0, 0.35)'
    context.shadowBlur = 4
    context.shadowOffsetY = 1
    context.beginPath()
    context.arc(center, center, badgeRadius, 0, Math.PI * 2)
    context.fillStyle = '#ffffff'
    context.fill()
    context.restore()
    context.beginPath()
    context.arc(center, center, badgeRadius, 0, Math.PI * 2)
    context.lineWidth = 5
    context.strokeStyle = color
    context.stroke()
    try {
      const logo = await loadImage(logoUrl)
      const logoSize = 52
      context.drawImage(logo, center - logoSize / 2, center - logoSize / 2, logoSize, logoSize)
    } catch {
      // logo 加载失败时角标内画组色圆点,图标仍可辨识归属应用家族
      context.beginPath()
      context.arc(center, center, 12, 0, Math.PI * 2)
      context.fillStyle = color
      context.fill()
    }
  }

  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`图标加载失败: ${src}`))
    image.src = src
  })
}

/**
 * 创建桌面快捷方式(保存位置由用户在对话框中自选)。
 * 图标合成在渲染端(需要 canvas 渲染 SVG),.lnk/ICO 落盘在主进程。
 * 返回 true 表示已创建;用户在保存对话框中取消返回 false,不视为错误。
 */
export async function createComponentDesktopShortcut(windowId: string, name: string): Promise<boolean> {
  const iconDataUrl = await buildComponentIconDataUrl(windowId)
  const result = (await window.ipcRenderer.invoke('create-desktop-shortcut', {
    windowId,
    name,
    iconDataUrl,
  })) as { ok: boolean; cancelled?: boolean; shortcutPath?: string; error?: string }
  if (result.cancelled) return false
  if (!result.ok) throw new Error(result.error || '创建快捷方式失败')
  return true
}
