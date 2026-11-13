import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { JpegStreamParser } from '@/core/camera/JpegStreamParser'
import { getPanelById } from '@/core/panels/registry'
import { DEFAULT_APPLICATIONS } from '@/core/application/ApplicationStorage'
import { CameraStreamService } from '../../electron/main/services/CameraStreamService'

describe('camera panels', () => {
  it('provides video and parameter panels in the registry', () => {
    expect(getPanelById('camera-video')).toMatchObject({
      title: 'panel.camera-video.title',
      componentName: 'CameraVideo',
      funcMode: 'general',
      catalogGroup: 'camera',
    })
    expect(getPanelById('camera-parameters')).toMatchObject({
      title: 'panel.camera-parameters.title',
      componentName: 'CameraParameters',
      action: 'camera-config',
      catalogGroup: 'camera',
    })
  })

  it('groups Flow Deviation under General without changing its flow data mode', () => {
    expect(getPanelById('flow-deviation')).toMatchObject({
      funcMode: 'flow',
      catalogGroup: 'general',
    })
  })

  it('provides a ready-to-use default Camera application', () => {
    expect(DEFAULT_APPLICATIONS).toContainEqual(
      expect.objectContaining({
        id: 'camera',
        icon: 'camera',
        windowIds: ['camera-video', 'camera-parameters', 'raw-messages', 'terminal'],
      }),
    )
  })

  it('keeps command editing, byte-format switching, and help available', () => {
    const source = readFileSync('src/components/windows/common/CameraParameters.vue', 'utf8')

    expect(source).toContain("t('common.camera.subCommandType')")
    expect(source).toContain("t('common.camera.subCommandContent')")
    expect(source).toMatch(/<el-switch\s+v-model="contentIsHex"/)
    expect(source).toContain(':rows="3"')
    expect(source).not.toContain("t('common.camera.tabs.connection')")
    expect(source).not.toContain("activeTab = 'connection'")
    expect(source).not.toContain('class="connection-grid"')
    expect(source).toContain('const { addMessage } = useConsole(true)')
    expect(source).not.toContain('class="output-summary"')
    expect(source).not.toContain('class="script-output"')
    expect(source).not.toContain('showFullOutput')
    expect(source).not.toContain('class="readonly-command"')
    expect(source).toContain('const showCommandHelp = ref(false)')
    expect(source).toContain('@click="showCommandHelp = true"')
    expect(source).toContain('class="app-dialog camera-command-help-dialog"')
    expect(source).not.toContain('class="command-hints"')
    expect(source).not.toContain('<small>')
    expect(source).not.toContain('<el-checkbox v-model="contentIsHex"')
  })

  it('distinguishes an active RTSP connection attempt from a playing session', () => {
    const service = new CameraStreamService('/nonexistent/nav-tools-ffmpeg')
    service.start(1, 'rtsp://127.0.0.1:8554/rgbstream', {
      id: 1,
      isDestroyed: () => false,
      send: () => undefined,
    })
    expect(service.listActive()).toEqual([
      {
        url: 'rtsp://127.0.0.1:8554/rgbstream',
        ownerWindowId: 1,
        status: 'connecting',
      },
    ])
    service.stop(1)
    expect(service.listActive()).toEqual([])
  })

  it('pins Accepted to the right and removes fixed-step controls', () => {
    const source = readFileSync('src/components/windows/common/CameraParameters.vue', 'utf8')
    const acceptedColumn = source.match(
      /<el-table-column\s+:label="t\('common\.camera\.calibration\.historyAccepted'\)"[\s\S]*?>/,
    )?.[0]
    expect(acceptedColumn).toContain('fixed="right"')
    expect(source).not.toContain('v-model="calForm.step"')
    expect(source).not.toContain('v-model="calForm.minStep"')
    expect(readFileSync('src/i18n/locales/en-US/common.ts', 'utf8')).toContain(
      "restore: 'Reset Params'",
    )
  })

  it('extracts JPEG frames split across stream chunks', () => {
    const parser = new JpegStreamParser()
    expect(parser.push(Uint8Array.from([0, 0xff, 0xd8, 1, 2]))).toEqual([])
    expect(parser.push(Uint8Array.from([3, 0xff, 0xd9, 0xff, 0xd8, 4, 0xff, 0xd9]))).toEqual([
      Uint8Array.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]),
      Uint8Array.from([0xff, 0xd8, 4, 0xff, 0xd9]),
    ])
  })
})
