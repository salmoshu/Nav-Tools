import { getWindowById } from '@/settings/config'
import { toolBarIcon } from '@/settings/icons'
import { applicationIconComponents } from '@/settings/applicationIcons'

/**
 * 取组件图标的 SVG 文档字符串。面板 action 的图标有两处来源:
 * toolBarIcon 里是内联 SVG 字符串;applicationIconComponents 里是
 * element-plus 图标组件——对其 render vnode 提取 path d 再拼成 SVG。
 */
function componentActionSvg(action: string): string | undefined {
  const raw = toolBarIcon[action as keyof typeof toolBarIcon]
  if (typeof raw === 'string') return raw

  const paths = extractElementIconPaths(
    applicationIconComponents[action as keyof typeof applicationIconComponents],
  )
  if (paths.length === 0) return undefined
  return (
    `<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">` +
    paths.map((path) => `<path d="${path}" fill="#2a3a4f"/>`).join('') +
    `</svg>`
  )
}

/** element-plus 图标组件 render 出 svg vnode,从 path 子节点收集 d 属性 */
function extractElementIconPaths(component: unknown): string[] {
  try {
    const render = (component as { render?: unknown } | undefined)?.render
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
 * 合成桌面快捷方式图标:Nav-Tools 主图标为底,右下角叠加组件图标角标
 * (白底圆 + 主题色描边 + 组件 SVG),输出 256px PNG data URL,
 * 由主进程封装成 .ico 供 .lnk 使用。
 */
export async function buildComponentIconDataUrl(windowId: string): Promise<string> {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建画布')

  const definition = getWindowById(windowId)
  const svg = definition ? componentActionSvg(definition.action) : undefined

  // 底图:应用 logo;加载失败也要给出角标版图标
  try {
    const logo = await loadImage(new URL('logo_transparent.png', document.baseURI).href)
    context.drawImage(logo, 0, 0, size, size)
  } catch {
    context.fillStyle = '#1f6feb'
    context.fillRect(0, 0, size, size)
  }

  if (svg) {
    const badgeRadius = 78
    const center = size - badgeRadius - 12
    // 角标圆:白底 + 应用主题色描边,在深浅壁纸上都可辨
    context.beginPath()
    context.arc(center, center, badgeRadius, 0, Math.PI * 2)
    context.fillStyle = '#ffffff'
    context.fill()
    context.lineWidth = 10
    context.strokeStyle = '#1f6feb'
    context.stroke()
    try {
      const icon = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      // svg 自带 16/24px 尺寸,统一按目标框缩放绘制
      const iconSize = 88
      context.drawImage(icon, center - iconSize / 2, center - iconSize / 2, iconSize, iconSize)
    } catch {
      // 组件图标绘制失败时退化为角标内绘制组件名首字符,快捷方式仍可辨识
      const label = (definition?.componentName ?? 'N').slice(0, 1).toUpperCase()
      context.fillStyle = '#1f6feb'
      context.font = 'bold 64px sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(label, center, center + 4)
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
