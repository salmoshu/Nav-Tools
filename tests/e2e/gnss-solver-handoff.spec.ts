import { expect, test } from '@playwright/test'
import { openSolver } from './support/gnssSolver'

test('opens an immutable solver result in GNSS and returns to the intact source workspace', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.addInitScript(() => {
    localStorage.setItem(
      'nav-tools:custom-applications',
      JSON.stringify([
        {
          id: 'gnsslib',
          name: 'My GNSS-Lib',
          description: 'Handoff source workspace',
          icon: 'satellite',
          accent: '#7c3aed',
          windowIds: ['gnsslib-solver', 'raw-messages', 'gnss-deviation'],
        },
        {
          id: 'gnss',
          name: 'My GNSS',
          description: 'Handoff target workspace',
          icon: 'position',
          accent: '#0ea5e9',
          windowIds: ['gnss-deviation', 'gnss-signals', 'sky-plot', 'raw-messages'],
        },
      ]),
    )
  })

  const panel = await openSolver(page, 'post', true, 'zh-CN')
  await panel.locator('.execute-button').click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__solverPostCalls'))).toBe(1)

  await page.evaluate(() => {
    Reflect.set(
      window.electronAPI,
      'appHandoffCreateSolutionSnapshot',
      async (request: {
        sourcePath: string
        runId: string
        kind: 'completed-result' | 'realtime-snapshot'
        format: 'nmea' | 'rtklib-pos'
      }) => {
        Reflect.set(window, '__handoffSnapshotRequest', request)
        return {
          artifact: {
            artifactId: 'handoff-e2e',
            producerAppId: 'gnsslib',
            runId: request.runId,
            createdAt: '2024-07-30T00:00:10.000Z',
            kind: request.kind,
            files: [
              {
                path: '/data/handoff-e2e.pos',
                role: 'solution',
                format: request.format,
                sizeBytes: 512,
                modifiedAt: '2024-07-30T00:00:10.000Z',
              },
            ],
          },
          recordCount: 5,
        }
      },
    )
    Reflect.get(window, '__solverCompletePost')({ count: 5 })
  })

  await expect(panel.locator('.solver-state')).toHaveText('解算完成')
  await panel.getByRole('button', { name: '在 GNSS 中检核', exact: true }).click()

  await expect(page.locator('.handoff-return')).toBeVisible()
  await expect(page.locator('.handoff-return')).toHaveText('返回 My GNSS-Lib')
  await expect(page.locator('.context-app-name')).toHaveText('My GNSS')
  await expect(page.locator('.context-file-name')).toHaveText('handoff-e2e.pos')
  await expect(page.locator('.deviation-container')).toBeVisible()
  expect(
    await page.evaluate(() => Reflect.get(window, '__handoffSnapshotRequest')),
  ).toMatchObject({
    sourcePath: '/data/rover.pos',
    kind: 'completed-result',
    format: 'rtklib-pos',
  })

  await page.locator('.handoff-return').click()
  await expect(panel).toBeVisible()
  await expect(panel.locator('.solver-state')).toHaveText('解算完成')
  await expect(panel.locator('.solver-run-metrics')).toContainText('5')
  await expect(page.locator('.context-app-name')).toHaveText('My GNSS-Lib')
  await expect(page.locator('.handoff-return')).toHaveCount(0)
  expect(errors).toEqual([])
})
