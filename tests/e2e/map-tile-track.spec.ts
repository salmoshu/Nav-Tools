import { expect, test } from '@playwright/test'

function gga(epoch: number): string {
  const longitude = (1131 + epoch / 100).toFixed(4).padStart(10, '0')
  const body = `GNGGA,1235${epoch.toFixed(1).padStart(4, '0')},4807.038,N,${longitude},E,1,08,0.9,545.4,M,46.9,M,,`
  const checksum = [...body]
    .reduce((sum, character) => sum ^ character.charCodeAt(0), 0)
    .toString(16)
    .toUpperCase()
    .padStart(2, '0')
  return `$${body}*${checksum}\r\n`
}

test('synchronizes cache corridors during a continuous 10 Hz GNSS stream and clears pending updates', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const updates: number[][][] = []
    Object.defineProperty(window, '__mapTileTrackUpdates', { value: updates })
    Object.defineProperty(window, 'ipcRenderer', {
      value: {
        on() {},
        off() {},
        invoke: () => Promise.resolve(undefined),
        send(channel: string, points: number[][]) {
          if (channel === 'map-tile-track-update') updates.push(structuredClone(points))
        },
      },
    })
    localStorage.setItem('nav-tools:locale', 'en-US')
  })
  const payload = encodeURIComponent(
    JSON.stringify({ componentName: 'GnssMap', windowId: 'gnss-map', title: 'Map' }),
  )
  await page.goto(`/#card/${payload}`)
  await expect(page.locator('.gnss-map-container')).toBeVisible()
  await page.clock.install({ time: new Date('2026-11-06T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-11-06T00:00:01Z'))

  for (let index = 0; index < 10; index += 1) {
    await page.evaluate(
      async (sentence) => {
        const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
        useNmea().processRawData(sentence)
      },
      gga(index / 10),
    )
    await page.clock.runFor(100)
    if (index === 2 || index === 5 || index === 8) {
      const updates: number[][][] = await page.evaluate(() =>
        Reflect.get(window, '__mapTileTrackUpdates'),
      )
      expect(updates.filter((points) => points.length > 0).length).toBeGreaterThanOrEqual(
        Math.floor((index + 1) / 3),
      )
      expect(updates.at(-1)!.at(-1)![1]).toBeCloseTo(48.1173, 10)
      expect(updates.at(-1)!.at(-1)![2]).toBe(1)
    }
  }

  await page.clock.runFor(250)
  const latest: number[][] = await page.evaluate(() =>
    Reflect.get(window, '__mapTileTrackUpdates').at(-1),
  )
  expect(latest).toHaveLength(10)
  expect(latest.at(-1)![0]).toBeCloseTo(11 + 31.009 / 60, 10)

  // Queue one more update without advancing its timer, then clear the track.
  await page.evaluate(async (sentence) => {
    const { useNmea } = await import('/src/composables/gnss/useNmea.ts')
    useNmea().processRawData(sentence)
  }, gga(1))
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.clock.runFor(500)
  expect(await page.evaluate(() => Reflect.get(window, '__mapTileTrackUpdates').at(-1))).toEqual([])
})
