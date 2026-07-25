import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { JpegStreamParser } from '@/core/camera/JpegStreamParser'
import { getPanelById } from '@/core/panels/registry'
import { DEFAULT_APPLICATIONS } from '@/core/application/ApplicationStorage'

describe('camera panels', () => {
  it('provides video and parameter panels in the registry', () => {
    expect(getPanelById('camera-video')).toMatchObject({
      title: 'Camera Video',
      componentName: 'CameraVideo',
      funcMode: 'general',
      catalogGroup: 'camera',
    })
    expect(getPanelById('camera-parameters')).toMatchObject({
      title: 'Camera Parameters',
      componentName: 'CameraParameters',
      action: 'config',
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
        windowIds: ['camera-video', 'camera-parameters'],
      }),
    )
  })

  it('uses compact horizontal command fields without heading descriptions', () => {
    const source = readFileSync('src/components/windows/common/CameraParameters.vue', 'utf8')

    expect(source).toContain('<span class="field-label">子命令类型</span>')
    expect(source).toContain('<span class="field-label">子命令内容</span>')
    expect(source).toContain('<el-switch v-model="contentIsHex"')
    expect(source).toContain(':rows="3"')
    expect(source).toContain('<span>登录命令</span>')
    expect(source).toContain('model-value="0x00000001"')
    expect(source).not.toContain('class="readonly-command"')
    expect(source).toContain('const showCommandHelp = ref(false)')
    expect(source).toContain('@click="showCommandHelp = true"')
    expect(source).toContain('class="app-dialog camera-command-help-dialog"')
    expect(source).not.toContain('class="command-hints"')
    expect(source).not.toContain('<small>')
    expect(source).not.toContain('<el-checkbox v-model="contentIsHex"')
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
