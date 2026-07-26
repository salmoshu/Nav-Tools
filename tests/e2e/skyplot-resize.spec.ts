/**
 * 回归测试：skyplot 在暂停（无新数据）时，面板最大化 / 窗口尺寸变化后
 * 极坐标图必须铺满容器并保持水平垂直居中。
 *
 * 背景：chartInstance 用 ref 持有会被 Vue 深度响应式化，echarts 内部身份比较失效，
 * resize() 在 polar 重建坐标系时抛错被静默吞掉，图表停留在左上角旧尺寸。
 *
 * 用法：pnpm exec playwright test tests/e2e/skyplot-resize.spec.ts
 */
import { test, expect } from '@playwright/test'

function nmea(body: string): string {
  let cs = 0
  for (const c of body) cs ^= c.charCodeAt(0)
  return `$${body}*${cs.toString(16).toUpperCase().padStart(2, '0')}\r\n`
}

// 造卫星 GSV（GPS + BeiDou），注入一次后停止，模拟“有数据后暂停播放”
function buildEpoch(): string {
  const groups: Array<{ talker: string; sats: number[][] }> = [
    {
      talker: 'GPGSV',
      sats: [
        [3, 45, 20, 42], [7, 60, 120, 38], [12, 30, 200, 35], [19, 70, 300, 45],
      ],
    },
    {
      talker: 'GPGSV',
      sats: [
        [24, 15, 40, 30], [28, 50, 260, 40], [32, 25, 320, 33], [5, 80, 90, 48],
      ],
    },
    {
      talker: 'GBGSV',
      sats: [
        [1, 55, 30, 44], [6, 35, 150, 36], [11, 65, 240, 41], [16, 20, 280, 28],
      ],
    },
  ]
  const lines: string[] = []
  for (const { talker, sats } of groups) {
    const fields = sats.flatMap(([prn, el, az, snr]) => [
      String(prn).padStart(2, '0'), String(el), String(az), String(snr),
    ])
    lines.push(nmea([talker, '1', '1', '08', ...fields].join(',')))
  }
  return lines.join('')
}

// 通过 e2e 钩子读取极坐标布局：圆心像素坐标 + 半径像素值
async function measurePolar(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const chart = (window as any).__gnssSkyChart
    const el = document.querySelector('.sky-chart') as HTMLElement
    if (!chart || !el) return null
    // radiusAxis inverse: true —— 值 90 映射圆心，值 0 映射外圈
    const center = chart.convertToPixel({ polarIndex: 0 }, [90, 0]) as number[]
    const edge = chart.convertToPixel({ polarIndex: 0 }, [0, 0]) as number[]
    return {
      w: el.clientWidth,
      h: el.clientHeight,
      cx: center[0],
      cy: center[1],
      r: Math.hypot(edge[0] - center[0], edge[1] - center[1]),
    }
  })
}

function expectFilled(m: NonNullable<Awaited<ReturnType<typeof measurePolar>>>, label: string) {
  // 圆心居中（允许 3% 容器尺寸误差）
  expect(Math.abs(m.cx - m.w / 2), `${label} center x`).toBeLessThan(m.w * 0.03)
  expect(Math.abs(m.cy - m.h / 2), `${label} center y`).toBeLessThan(m.h * 0.03)
  // 半径 = 85% * min(w,h)/2（允许 10% 误差）
  const expectedR = 0.85 * Math.min(m.w, m.h) / 2
  expect(Math.abs(m.r - expectedR) / expectedR, `${label} radius`).toBeLessThan(0.1)
}

test('skyplot fills panel on fullscreen/resize while paused', async ({ page }) => {
  const application = {
    id: 'skytest',
    name: 'Sky Test',
    description: '',
    icon: 'grid',
    accent: '#3b82f6',
    windowIds: ['sky-plot'],
  }
  await page.addInitScript((app) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([app]))
    localStorage.setItem('nav-tools:selected-application', app.id)
  }, application)

  await page.goto(`/#app/${application.id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('.vgl-item:not(.vgl-item--placeholder)', { timeout: 60_000 })
  await page.waitForSelector('.sky-chart svg', { timeout: 30_000 })
  await page.waitForTimeout(1000)

  // 注入一次数据后停止（模拟暂停播放，之后不再有新数据驱动刷新）
  await page.evaluate((epoch) => {
    return import('/src/composables/gnss/useNmea.ts').then((m) => {
      m.useNmea().processRawData(epoch)
    })
  }, buildEpoch())
  await page.waitForTimeout(600)

  const before = await measurePolar(page)
  console.log('[skyplot] before:', JSON.stringify(before))
  expect(before).not.toBeNull()
  expectFilled(before!, 'initial')

  // 1) 面板最大化（暂停状态下）
  await page.getByTitle('全屏展示', { exact: true }).first().click()
  await page.waitForTimeout(1500) // 等 0.3s 过渡动画 + resize 稳定
  const maximized = await measurePolar(page)
  console.log('[skyplot] maximized:', JSON.stringify(maximized))
  expect(maximized).not.toBeNull()
  expect(maximized!.w).toBeGreaterThan(before!.w * 1.5) // 确认确实变大了
  expectFilled(maximized!, 'maximized')
  await page.screenshot({ path: 'tmp/skyplot-maximized.png' })

  // 2) 最大化状态下调整浏览器窗口（暂停状态下）
  await page.setViewportSize({ width: 1000, height: 600 })
  await page.waitForTimeout(1000)
  const resized = await measurePolar(page)
  console.log('[skyplot] viewport resized:', JSON.stringify(resized))
  expect(resized).not.toBeNull()
  expectFilled(resized!, 'viewport-resized')

  // 3) 退出最大化，回到网格布局
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1000)
  const restored = await measurePolar(page)
  console.log('[skyplot] restored:', JSON.stringify(restored))
  expect(restored).not.toBeNull()
  expectFilled(restored!, 'restored')
})
