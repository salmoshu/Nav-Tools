import { describe, expect, it } from 'vitest'
import { JpegStreamParser } from '@/core/camera/JpegStreamParser'
import { getPanelById } from '@/core/panels/registry'
import { DEFAULT_APPLICATIONS } from '@/core/application/ApplicationStorage'

describe('camera video panel', () => {
  it('is available in the panel registry', () => {
    expect(getPanelById('camera-video')).toMatchObject({
      title: 'Camera Video',
      componentName: 'CameraVideo',
      funcMode: 'general',
    })
  })

  it('provides a ready-to-use default Camera application', () => {
    expect(DEFAULT_APPLICATIONS).toContainEqual(expect.objectContaining({
      id: 'camera',
      icon: 'camera',
      windowIds: ['camera-video'],
    }))
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
