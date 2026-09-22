// 文本文件样本时钟回放端到端验证：无伴生 .tag 的 CSV 选择“时间戳播放”后，
// 回落为虚拟时间轴回放（表头作 key、time 列驱动时间轴），控制台逐行投影。
// 运行于 Web 构建（playwright webServer 自动启动 pnpm run dev:web）。
import { expect, test } from '@playwright/test'

const TEXT_APP = {
  id: 'text-replay-e2e',
  name: 'Text Replay',
  description: 'CSV sample-clock replay audit',
  icon: 'grid',
  accent: '#3b82f6',
  windowIds: ['raw-messages', 'plot'],
}

const CSV_CONTENT = ['time,value', '1.0,10', '1.5,20', '2.0,30'].join('\n')

test('a CSV without a time-tag falls back to sample-clock replay on the toolbar timeline', async ({
  page,
}) => {
  await page.addInitScript((application) => {
    localStorage.setItem('nav-tools:custom-applications', JSON.stringify([application]))
    localStorage.setItem('nav-tools:selected-application', application.id)
    // 模拟 Electron 主进程：time-tag 播放因缺少 .tag 伴生文件而失败（ENOENT），
    // 触发渲染端的样本时钟回放回落；文件内容经浏览器 File 对象读取，无需 IPC。
    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        invoke: (channel: string) => {
          if (channel === 'file-playback-start') {
            return Promise.reject(
              new Error("ENOENT: no such file or directory, open 'algo.csv.tag'"),
            )
          }
          if (channel === 'file-playback-stop') return Promise.resolve()
          return Promise.reject(new Error(`IPC is unavailable: ${channel}`))
        },
        send: () => undefined,
        on: () => () => undefined,
        off: () => undefined,
      },
    })
  }, TEXT_APP)

  await page.goto('/')
  const closeSelector = page.getByRole('button', {
    name: /关闭应用选择器|Close Application Selector/i,
  })
  await closeSelector.click({ timeout: 12_000 }).catch(() => {})
  await expect(page.locator('.layout-component')).toHaveCount(TEXT_APP.windowIds.length, {
    timeout: 20_000,
  })

  await page.getByTitle(/Input|输入/).first().click()
  const dialog = page.locator('.data-input-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await page.getByRole('tab', { name: /文件输入|File Input/ }).click()

  const fileChooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: /选择文件|Select File/ }).click()
  await (
    await fileChooser
  ).setFiles({
    name: 'algo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV_CONTENT),
  })

  // 播放倍速 ×0（批量加载）→ ×1（时间戳播放，触发 .tag 读取）
  const speedGroup = dialog.locator('.input-group', {
    has: page.getByText(/播放倍速|Replay Speed/),
  })
  await speedGroup.locator('.el-select').click()
  await page
    .locator('.replay-speed-dropdown .el-select-dropdown__item')
    .getByText('×1', { exact: true })
    .click()

  await dialog.getByRole('button', { name: /确认|Confirm|OK/ }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })

  // 工具栏时间轴出现：4 个历元（表头 + 3 行数据），时长 1s，从 0 自动播放
  await expect(page.locator('.file-timeline')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.timeline-epoch')).toContainText('/ 4', { timeout: 15_000 })

  // 播放结束后光标停在末尾历元（time 列 1.0→2.0 归一化为 0→1s），全部行可见
  await expect(page.locator('.timeline-time')).toContainText('00:00:01', { timeout: 15_000 })
  const messages = page.locator('.message-content')
  await expect(messages).toHaveCount(4, { timeout: 15_000 })
  await expect(messages.first()).toContainText('time,value')
  await expect(messages.last()).toContainText('2.0,30')
})
