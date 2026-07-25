// 手动验证驱动：电机指令结构拖拽的挤压动画（非自动化测试，供 run/verify 使用）
const { chromium } = require('@playwright/test')

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'

async function fieldOrder(page) {
  return page.$$eval('.motor-config-dialog .message-field', els =>
    els.map(el => el.dataset.fieldId),
  )
}

async function center(locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element not visible')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

  await page.addInitScript(() => {
    const app = {
      id: 'motor-drag-audit',
      name: '电机拖拽验证',
      description: '',
      icon: 'grid',
      accent: '#3b82f6',
      windowIds: ['motor-parameters'],
    }
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([app]))
    localStorage.setItem('nav-tools:selected-application', app.id)
    localStorage.removeItem('motor-config')
  })

  await page.goto(`${BASE}/#app/motor-drag-audit`)
  const card = page.locator('.vgl-item:not(.vgl-item--placeholder)').first()
  await card.locator('.config-btn').click()
  const dialog = page.locator('.motor-config-dialog')
  await dialog.waitFor({ state: 'visible' })
  await page.waitForTimeout(400)

  const initialOrder = await fieldOrder(page)
  console.log('初始顺序:', initialOrder.join(' -> '))

  const functionField = dialog.locator('.message-field[data-field-id="function"]')
  const dataField = dialog.locator('.message-field[data-field-id="data"]')

  // --- 回归检查：从 el-select 上按下移动不应触发拖拽 ---
  const selectCenter = await center(functionField.locator('.el-select').first())
  await page.mouse.move(selectCenter.x, selectCenter.y)
  await page.mouse.down()
  await page.mouse.move(selectCenter.x + 30, selectCenter.y, { steps: 3 })
  const draggingFromSelect = await page.evaluate(
    () => document.querySelector('.structure-drag-clone') !== null,
  )
  await page.mouse.up()
  console.log('从下拉框按下移动触发拖拽?', draggingFromSelect ? '是(异常)' : '否(正常)')
  await page.keyboard.press('Escape').catch(() => {})

  // --- 拖动“功能码”到“数据内容”之后 ---
  const from = await center(functionField)
  const to = await center(dataField)
  const destX = to.x + to.box.width / 2 + 10
  const destY = to.y

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // 第一段：移动到中间（registerCount 与 length 之间）
  const midX = from.x + (destX - from.x) * 0.45
  await page.mouse.move(midX, from.y, { steps: 8 })
  await page.waitForTimeout(120)
  const midState = await page.evaluate(() => {
    const dragEl = document.querySelector('.structure-drag-clone')
    return {
      isDragging: dragEl !== null,
      dragPosition: dragEl?.style.position || null,
      dragId: dragEl?.getAttribute('data-field-id') || null,
    }
  })
  console.log('拖动中状态:', JSON.stringify(midState))
  await page.screenshot({ path: 'test-results/motor-structure-drag-mid1.png' })

  // 第二段：快速移动到目的地后立即截图（捕捉挤压动画进行中的位移）
  await page.mouse.move(destX, destY, { steps: 10 })
  await page.screenshot({ path: 'test-results/motor-structure-drag-mid2.png' })
  const dragBoxDuring = await page
    .locator('.structure-drag-clone')
    .boundingBox()
  console.log(
    '被拖模块位置:',
    dragBoxDuring ? `x=${Math.round(dragBoxDuring.x)}, y=${Math.round(dragBoxDuring.y)}` : '未找到',
    '| 鼠标:',
    `x=${Math.round(destX)}, y=${Math.round(destY)}`,
  )

  await page.mouse.up()
  await page.waitForTimeout(450)
  const finalOrder = await fieldOrder(page)
  console.log('最终顺序:', finalOrder.join(' -> '))
  await page.screenshot({ path: 'test-results/motor-structure-drag-final.png' })

  const expected = ['header', 'address', 'registerCount', 'length', 'data', 'function', 'checksum']
  const pass = JSON.stringify(finalOrder) === JSON.stringify(expected)
  console.log(pass ? 'PASS: 功能码已移动到数据内容之后' : `FAIL: 期望 ${expected.join(' -> ')}`)

  await browser.close()
  process.exit(pass && midState.isDragging === true && midState.dragPosition === 'fixed' ? 0 : 1)
})().catch(err => {
  console.error(err)
  process.exit(1)
})
