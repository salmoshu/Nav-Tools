import { expect, test } from '@playwright/test'

for (const locale of ['en-US', 'zh-CN']) {
  for (const source of ['file', 'serial', 'network']) {
    test(`Messages highlights only the data-format selector for ${source} in ${locale}`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ locale, source }) => {
          localStorage.setItem('nav-tools:locale', locale)
          localStorage.setItem(
            'nav-tools:data-source-settings',
            JSON.stringify({ activeSource: source, [source]: { parser: 'raw' } }),
          )
        },
        { locale, source },
      )
      await page.goto('/')
      await page.locator('.application-card[data-application-id="serial"]').click()
      await page.locator('.data-parser-badge').click()
      const dialog = page.locator('.data-input-dialog')
      await expect(dialog).toBeVisible()
      await expect(
        dialog.getByRole('tab', {
          name: locale === 'zh-CN' ? '连接管理' : 'Connection management',
          exact: true,
        }),
      ).toBeVisible()
      const selector = dialog.locator(`#pane-${source} .parser-select`)
      const input = selector.locator('.el-input__wrapper')
      await expect(input).toBeVisible()
      await expect(input).toHaveCSS('animation-name', /parser-select-flash/)
      await input.evaluate((element) => {
        for (const animation of element.getAnimations()) {
          animation.pause()
          animation.currentTime = 0
        }
      })
      await expect(input).toHaveCSS('opacity', '1')
      const initialShadow = await input.evaluate((element) => getComputedStyle(element).boxShadow)
      await input.evaluate((element) => {
        for (const animation of element.getAnimations()) animation.currentTime = 1800
      })
      await expect(input).toHaveCSS('opacity', '1')
      await expect(input).not.toHaveCSS('box-shadow', initialShadow)
      const card = selector.locator('xpath=ancestor::div[contains(@class,"parser-card")]')
      expect(await card.evaluate((element) => getComputedStyle(element, '::before').content)).toBe(
        'none',
      )
    })
  }
}
