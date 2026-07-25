/**
 * 临时性能压测：定位 GNSS 长时间运行卡顿的罪魁窗口。
 *
 * 用法：
 *   pnpm exec playwright test tests/e2e/tmp-gnss-stress.spec.ts
 * 环境变量：
 *   GNSS_SUBSETS=baseline,raw-messages   只跑指定子集（逗号分隔）
 *   GNSS_SPEED=10                        回放加速倍率（1 = 实时 10Hz epoch）
 *   GNSS_MAX_EPOCHS=0                    限制 epoch 数（0 = 全部）
 * 结果写入 tmp/stress-<label>-<speed>x.json
 */
import { test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const DATA_PATH = 'C:/Users/ESSZ/Desktop/gnss-test/rs.txt'
const SPEED = Number(process.env.GNSS_SPEED || 10)
const MAX_EPOCHS = Number(process.env.GNSS_MAX_EPOCHS || 0)

const ALL_WINDOWS = ['raw-messages', 'gnss-deviation', 'gnss-signals', 'sky-plot']

const SUBSETS: Record<string, string[]> = {
  baseline: [],
  'gnss-deviation': ['gnss-deviation'],
  'raw-messages': ['raw-messages'],
  'gnss-signals': ['gnss-signals'],
  'sky-plot': ['sky-plot'],
  all: ALL_WINDOWS,
  'no-raw': ['gnss-deviation', 'gnss-signals', 'sky-plot'],
}

const enabled = (process.env.GNSS_SUBSETS || Object.keys(SUBSETS).join(',')).split(',')

// 按 GGA 行切 epoch（每个 epoch 一个 GGA + 其后的 GSA/GSV/RMC/VTG/GST）
function loadEpochs(): string[] {
  const lines = fs.readFileSync(DATA_PATH, 'utf-8').split(/\r?\n/)
  const epochs: string[] = []
  let cur: string[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    if (line.includes('GGA') && cur.length > 0) {
      epochs.push(cur.join('\n') + '\n')
      cur = []
    }
    cur.push(line)
  }
  if (cur.length > 0) epochs.push(cur.join('\n') + '\n')
  return MAX_EPOCHS > 0 ? epochs.slice(0, MAX_EPOCHS) : epochs
}

const epochs = loadEpochs()
const FEED_SECONDS = epochs.length / 10 / SPEED

test.describe('gnss stress', () => {
  for (const label of Object.keys(SUBSETS)) {
    if (!enabled.includes(label)) continue
    const windowIds = SUBSETS[label]

    test(`subset=${label} speed=${SPEED}x`, async ({ page }) => {
      const timeoutMult = Number(process.env.GNSS_TIMEOUT_MULT || 1)
      test.setTimeout((FEED_SECONDS * timeoutMult + 300) * 1000)

      const application = {
        id: `stress-${label}`,
        name: `Stress ${label}`,
        description: '',
        icon: 'grid',
        accent: '#3b82f6',
        windowIds,
      }

      await page.addInitScript((app) => {
        localStorage.setItem('nav-tools:custom-applications', JSON.stringify([app]))
        localStorage.setItem('nav-tools:selected-application', app.id)
        ;(window as any).__lt = { count: 0, total: 0, max: 0 }
        try {
          new PerformanceObserver((list) => {
            const lt = (window as any).__lt
            for (const e of list.getEntries()) {
              lt.count += 1
              lt.total += e.duration
              if (e.duration > lt.max) lt.max = e.duration
            }
          }).observe({ entryTypes: ['longtask'] })
        } catch {
          /* longtask 不可用时忽略 */
        }
      }, application)

      await page.goto(`/#app/${application.id}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      if (windowIds.length > 0) {
        await page.waitForSelector('.vgl-item:not(.vgl-item--placeholder)', { timeout: 60_000 })
      } else {
        await page.waitForSelector('.dashboard-content', { timeout: 60_000 })
      }
      await page.waitForTimeout(3000) // 等 WebGL/echarts 初始化稳定

      const feedRaw = windowIds.includes('raw-messages')

      // 对照实验：关闭 Raw Messages 自动置底
      if (process.env.GNSS_AUTOSCROLL_OFF === '1' && feedRaw) {
        try {
          await page.getByTitle('手动滚动', { exact: true }).first().click({ timeout: 5000 })
          console.log(`[stress:${label}] auto-scroll disabled`)
        } catch {
          console.log(`[stress:${label}] WARN: failed to disable auto-scroll`)
        }
      }

      let result: any
      try {
        result = await page.evaluate(
        async ({ epochList, speed, feedRaw }) => {
          const nmeaMod = await import('/src/composables/gnss/useNmea.ts')
          const nmea = nmeaMod.useNmea()

          let consoleApi: any = null
          if (feedRaw) {
            const cmod = await import('/src/composables/flow/useConsole.ts')
            consoleApi = cmod.useConsole(true)
            consoleApi.dataFormat.value = 'nmea'
          }

          let getUtc: () => string = () => ''
          try {
            const smod = await import('/src/stores/gnss.ts')
            const store = smod.useGnssStore()
            getUtc = () => String(store.status.utcTime ?? '')
          } catch {
          }

          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
          const interval = 100 / speed
          const lt = (window as any).__lt

          let rafCount = 0
          let rafAlive = true
          const rafLoop = () => {
            rafCount += 1
            if (rafAlive) requestAnimationFrame(rafLoop)
          }
          requestAnimationFrame(rafLoop)

          const samples: any[] = []
          ;(window as any).__samples = samples
          const t0 = performance.now()
          let bucketStart = t0
          let bucketRafStart = 0
          let bucketLtCount = 0
          let bucketLtTotal = 0

          for (let i = 0; i < epochList.length; i++) {
            const epochStart = performance.now()
            nmea.processRawData(epochList[i])
            if (consoleApi) consoleApi.addMessage(epochList[i])

            const now = performance.now()
            if (now - bucketStart >= 1000) {
              // 事件循环延迟
              const lag0 = performance.now()
              await sleep(0)
              const lagMs = performance.now() - lag0
              // 同步 DOM 操作延迟（强制布局）
              const d0 = performance.now()
              const el = document.createElement('div')
              el.style.cssText = 'position:absolute;left:-9999px;width:10px;height:10px'
              document.body.appendChild(el)
              void el.offsetHeight
              el.remove()
              const domMs = performance.now() - d0

              const span = now - bucketStart
              samples.push({
                tSec: Math.round((now - t0) / 1000),
                epoch: i + 1,
                fps: Math.round(((rafCount - bucketRafStart) * 1000) / span),
                ltCount: lt.count - bucketLtCount,
                ltMs: Math.round(lt.total - bucketLtTotal),
                heapMB: (performance as any).memory
                  ? Math.round((performance as any).memory.usedJSHeapSize / 1048576)
                  : -1,
                lagMs: Math.round(lagMs * 10) / 10,
                domMs: Math.round(domMs * 100) / 100,
                nmeaCount: nmea.nmeaData.value.length,
                rawMsgCount: consoleApi ? consoleApi.messages.value.length : null,
                utc: getUtc(),
              })
              bucketStart = now
              bucketRafStart = rafCount
              bucketLtCount = lt.count
              bucketLtTotal = lt.total
            }

            const elapsed = performance.now() - epochStart
            const delay = interval - elapsed
            await sleep(delay > 0 ? delay : 0)
          }
          rafAlive = false

          return {
            samples,
            totalLt: { count: lt.count, totalMs: Math.round(lt.total), maxMs: Math.round(lt.max) },
            wallMs: Math.round(performance.now() - t0),
          }
        },
        { epochList: epochs, speed: SPEED, feedRaw },
        )
      } catch (err) {
        // evaluate 失败/超时时，尽量回收页面内已采集的样本
        let salvaged: any[] = []
        try {
          salvaged = await Promise.race([
            page.evaluate(() => (window as any).__samples ?? []),
            new Promise<any[]>((r) => setTimeout(() => r([]), 10_000)),
          ])
        } catch {
        }
        const lt = await Promise.race([
          page.evaluate(() => (window as any).__lt ?? null).catch(() => null),
          new Promise<any>((r) => setTimeout(() => r(null), 10_000)),
        ])
        result = {
          samples: salvaged,
          totalLt: lt
            ? { count: lt.count, totalMs: Math.round(lt.total), maxMs: Math.round(lt.max) }
            : { count: -1, totalMs: -1, maxMs: -1 },
          wallMs: salvaged.length ? salvaged[salvaged.length - 1].tSec * 1000 : -1,
          error: String(err),
        }
      }

      const out = {
        subset: label,
        windowIds,
        speed: SPEED,
        epochCount: epochs.length,
        wallMs: result.wallMs,
        totalLt: result.totalLt,
        samples: result.samples,
      }
      const outPath = path.join('tmp', `stress-${label}-${SPEED}x.json`)
      fs.mkdirSync('tmp', { recursive: true })
      fs.writeFileSync(outPath, JSON.stringify(out, null, 1))

      const s = result.samples
      const head = s.slice(0, 5)
      const tail = s.slice(-5)
      console.log(
        `[stress:${label}] epochs=${epochs.length} wall=${(result.wallMs / 1000).toFixed(0)}s ` +
          `lt=${result.totalLt.count}/${result.totalLt.totalMs}ms max=${result.totalLt.maxMs}ms`,
      )
      console.log(`[stress:${label}] first5=${JSON.stringify(head)}`)
      console.log(`[stress:${label}] last5=${JSON.stringify(tail)}`)
    })
  }
})
