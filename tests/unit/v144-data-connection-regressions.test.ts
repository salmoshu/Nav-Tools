import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { DATA_SOURCE_SETTINGS_KEY, DataSourceStorage } from '@/core/data/DataSourceStorage'
import { JsonStorage } from '@/core/storage/JsonStorage'

const toolbarSource = readFileSync('src/components/ToolBar.vue', 'utf8')
const deviceSource = readFileSync('src/hooks/useDevice.ts', 'utf8')
const cameraVideoSource = readFileSync('src/components/windows/common/CameraVideo.vue', 'utf8')
const cameraStorageSource = readFileSync('src/core/camera/CameraVideoStorage.ts', 'utf8')

describe('v1.4.4 shared data connection regressions', () => {
  beforeEach(() => localStorage.clear())

  it('aligns every NETWORK control on one shared grid', () => {
    expect(toolbarSource).toContain('class="source-config-card network-config-card"')
    expect(toolbarSource).toContain('.network-config-card .input-group')
    expect(toolbarSource).toContain('grid-template-columns: 94px minmax(0, 1fr);')
    expect(toolbarSource).not.toContain('v-model="networkProtocol" style="flex: 1"')
    expect(toolbarSource).not.toContain('style="flex: 1; width: 100%"')
  })

  it('persists a NETWORK loop switch and drives reconnect state from useDevice', () => {
    const storage = new DataSourceStorage(new JsonStorage(localStorage))
    const defaults = storage.load()
    expect(defaults.network).toMatchObject({ loop: false })

    localStorage.setItem(
      DATA_SOURCE_SETTINGS_KEY,
      JSON.stringify({
        ...defaults,
        network: { ...defaults.network, loop: true },
      }),
    )
    expect(new DataSourceStorage(new JsonStorage(localStorage)).load().network).toMatchObject({
      loop: true,
    })
    expect(toolbarSource).toContain('v-model="networkLoop"')
    expect(deviceSource).toContain("toRef(dataSourceSettings.network, 'loop')")
    expect(deviceSource).toContain('scheduleNetworkReconnect')
  })

  it('shows an immediate pending state while a failed NETWORK endpoint reconnects', () => {
    expect(toolbarSource).toContain("'toggle-pending': deviceConnecting")
    expect(toolbarSource).toContain(':aria-busy="deviceConnecting"')
    expect(deviceSource).toContain('globalDevice.value.connecting = true')
  })

  it('builds Camera Video from the shared NETWORK host and loop setting', () => {
    expect(cameraVideoSource).toContain('useDataSourceManager()')
    expect(cameraVideoSource).toContain('dataSourceSettings.network.host')
    expect(cameraVideoSource).toContain('dataSourceSettings.network.loop')
    expect(cameraVideoSource).toContain('v-model="streamProtocolDraft"')
    expect(cameraVideoSource).toContain('v-model="streamPortDraft"')
    expect(cameraVideoSource).toContain('v-model="streamSuffixDraft"')
    expect(cameraVideoSource).not.toContain('v-model="streamUrlDraft"')
    expect(cameraStorageSource).not.toContain('autoReconnect: boolean')
    expect(cameraStorageSource).not.toContain('streamUrl: string')
  })
})
