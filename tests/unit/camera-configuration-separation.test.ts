import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CAMERA_VIDEO_SETTINGS_KEY, CameraVideoStorage } from '@/core/camera/CameraVideoStorage'
import { isCameraTcpDataConnected } from '@/core/camera/CameraConnectionStatus'
import { JsonStorage, type StorageLike } from '@/core/storage/JsonStorage'

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>()

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  public removeItem(key: string): void {
    this.values.delete(key)
  }
}

const toolbarSource = readFileSync('src/components/ToolBar.vue', 'utf8')
const cameraVideoSource = readFileSync('src/components/windows/common/CameraVideo.vue', 'utf8')
const cameraParametersSource = readFileSync(
  'src/components/windows/common/CameraParameters.vue',
  'utf8',
)
const deviceSource = readFileSync('src/hooks/useDevice.ts', 'utf8')

describe('camera configuration separation', () => {
  it('removes Camera RTSP configuration from the shared data-input dialog', () => {
    expect(toolbarSource).not.toContain('name="camera"')
    expect(toolbarSource).not.toContain('cameraStreamUrl')
    expect(toolbarSource).not.toContain('<VideoCamera')
    expect(toolbarSource).not.toContain('loginCommand')
    expect(deviceSource).not.toContain('handleCameraSubmit')
    expect(deviceSource).not.toContain("case 'camera'")
  })

  it('configures the RTSP URL in a dedicated Camera Video dialog', () => {
    expect(cameraVideoSource).toContain('camera-video-source-dialog')
    expect(cameraVideoSource).toContain('v-model="streamUrlDraft"')
    expect(cameraVideoSource).toContain('saveCameraSourceSettings')
    expect(cameraVideoSource).toContain('CameraVideoStorage')
    expect(cameraVideoSource).not.toContain("emitter.emit('input-event'")
  })

  it('shows read-only TCP settings and delegates editing to the network data-input tab', () => {
    expect(cameraParametersSource).toContain(':model-value="host"')
    expect(cameraParametersSource).toContain(':model-value="portText"')
    expect(cameraParametersSource).toContain('readonly')
    expect(cameraParametersSource).toContain('openNetworkSettings')
    expect(cameraParametersSource).toContain(
      "emitter.emit('input-event', { tab: 'network', protocol: 'tcp' })",
    )
    expect(cameraParametersSource).toContain('model-value="0x00000001"')
    expect(cameraParametersSource).toContain("t('common.camera.loginCommand')")
    expect(deviceSource).toContain("requestedProtocol === 'tcp'")
  })

  it('reflects the matching shared TCP connection in Camera Parameters', () => {
    expect(cameraParametersSource).toContain('useDevice()')
    expect(cameraParametersSource).toContain('isCameraTcpDataConnected')
    expect(cameraParametersSource).toContain('const status = computed<Status>')
    expect(cameraParametersSource).not.toContain("const status = ref<Status>('disconnected')")
    expect(cameraParametersSource).not.toContain("status.value = 'disconnected'")

    expect(
      isCameraTcpDataConnected(
        {
          type: 'network',
          protocol: 'tcp',
          host: '192.168.3.14',
          port: 9000,
          connected: true,
        },
        { host: '192.168.3.14', port: 9000 },
      ),
    ).toBe(true)
    expect(
      isCameraTcpDataConnected(
        {
          type: 'network',
          protocol: 'udp',
          host: '192.168.3.14',
          port: 9000,
          connected: true,
        },
        { host: '192.168.3.14', port: 9000 },
      ),
    ).toBe(false)
    expect(
      isCameraTcpDataConnected(
        {
          type: 'network',
          protocol: 'tcp',
          host: '192.168.3.14',
          port: 9000,
          connected: false,
        },
        { host: '192.168.3.14', port: 9000 },
      ),
    ).toBe(false)
  })

  it('migrates the previous unified Camera URL into dedicated video settings', () => {
    const memory = new MemoryStorage()
    memory.setItem(
      'nav-tools:data-source-settings',
      JSON.stringify({ camera: { url: 'rtsp://10.0.0.8:8554/camera' } }),
    )

    const settings = new CameraVideoStorage(new JsonStorage(memory)).load()

    expect(settings).toEqual({
      version: 1,
      streamUrl: 'rtsp://10.0.0.8:8554/camera',
      autoReconnect: false,
    })
    expect(memory.getItem(CAMERA_VIDEO_SETTINGS_KEY)).toBe(JSON.stringify(settings))
  })

  it('normalizes invalid saved video settings to the default RTSP URL', () => {
    const memory = new MemoryStorage()
    memory.setItem(
      CAMERA_VIDEO_SETTINGS_KEY,
      JSON.stringify({ version: 1, streamUrl: 'http://invalid.example/video' }),
    )

    expect(new CameraVideoStorage(new JsonStorage(memory)).load().streamUrl).toBe(
      'rtsp://192.168.3.14:8554/rgbstream',
    )
  })
})
