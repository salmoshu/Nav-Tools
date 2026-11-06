import { expect, test } from '@playwright/test'

async function appendMessage(page: import('@playwright/test').Page, data: string): Promise<void> {
  await page.evaluate(async (data) => {
    const { useConsole } = await import('/src/composables/flow/useConsole.ts')
    useConsole(true).addMessage(data)
  }, data)
}

test('converts all existing messages to HEX without double-encoding later input', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('nav-tools:locale', 'en-US')
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: async () => undefined,
        send: () => undefined,
        on: () => undefined,
        off: () => undefined,
      },
    })
  })
  await page.goto('/')
  await page.locator('.application-card[data-application-id="serial"]').click()
  await expect(page.locator('.flow-console-virtual')).toBeVisible()
  await page.evaluate(async () => {
    const { useConsole } = await import('/src/composables/flow/useConsole.ts')
    const console = useConsole(true)
    console.clearMessages()
    console.dataFormat.value = 'none'
    console.displayFormat.value = 'ascii'
  })
  await appendMessage(page, 'Hello\nA\n')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useConsole } = await import('/src/composables/flow/useConsole.ts')
        return useConsole(true).messages.value.length
      }),
    )
    .toBe(2)

  const content = page.locator('.message-content')
  await expect(content).toHaveCount(2)
  await expect(content.nth(0)).toHaveText('Hello')
  await expect(content.nth(1)).toHaveText('A')

  await page.getByRole('button', { name: 'Show HEX', exact: true }).click()
  await expect(content.nth(0)).toHaveText('48656C6C6F')
  await expect(content.nth(1)).toHaveText('41')

  await appendMessage(page, '42\n')
  await expect(content).toHaveCount(3)
  await expect(content.nth(2)).toHaveText('42')

  await page.getByRole('button', { name: 'Show HEX', exact: true }).click()
  await expect(content.nth(0)).toHaveText('Hello')
  await expect(content.nth(1)).toHaveText('A')
  await expect(content.nth(2)).toHaveText('B')
})
