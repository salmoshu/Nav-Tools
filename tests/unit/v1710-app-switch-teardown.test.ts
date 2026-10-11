import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const deviceSource = readFileSync('src/hooks/useDevice.ts', 'utf8')
const toolbarSource = readFileSync('src/components/ToolBar.vue', 'utf8')

function functionBody(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  if (start === -1 || end === -1) throw new Error(`marker not found: ${startMarker} / ${endMarker}`)
  return source.slice(start, end)
}

describe('v1.7.10 app-switch connection teardown regressions', () => {
  it('removes the current device when switching applications', () => {
    // 应用切换 → 移除当前设备（连接断开 + 循环重连停止）
    expect(toolbarSource).toContain('watch(currentApplicationId')
    expect(toolbarSource).toContain('deviceInstance.removeCurrDevice()')
  })

  it('cancels the reconnect timer before closing the NETWORK connection', () => {
    for (const body of [
      functionBody(deviceSource, 'const removeCurrDevice', 'const closeCurrDevice'),
      functionBody(deviceSource, 'const closeCurrDevice', 'const handleInputSubmit'),
    ]) {
      expect(body).toContain('cancelNetworkReconnect()')
      expect(body.indexOf('cancelNetworkReconnect()')).toBeLessThan(
        body.indexOf('networkService.close()'),
      )
    }
  })

  it('invalidates in-flight NETWORK attempts on remove/close so a late open() cannot resurrect connected', () => {
    // 循环重连的在途 open() 在 removeCurrDevice/closeCurrDevice 之后才成功时,
    // 若不作废尝试序号, 会把 connected 重新置为 true(socket 实际已被销毁) —— 假「已连接」
    for (const body of [
      functionBody(deviceSource, 'const removeCurrDevice', 'const closeCurrDevice'),
      functionBody(deviceSource, 'const closeCurrDevice', 'const handleInputSubmit'),
    ]) {
      expect(body).toContain('networkOpenAttempt++')
      expect(body.indexOf('networkOpenAttempt++')).toBeLessThan(
        body.indexOf('networkService.close()'),
      )
    }
  })

  it('keeps the late-callback attempt guard in openNetworkDevice', () => {
    const openBody = functionBody(deviceSource, 'function openNetworkDevice', 'function routeIncomingData')
    expect(openBody).toContain('const attempt = ++networkOpenAttempt')
    expect(openBody.match(/if \(attempt !== networkOpenAttempt\) return/g)?.length).toBe(2)
  })
})
