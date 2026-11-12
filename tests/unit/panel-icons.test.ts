import { describe, expect, it } from 'vitest'
import { Camera, Operation } from '@element-plus/icons-vue'
import { componentBadgeSvg } from '@/core/panels/componentIcon'
import { getPanelById } from '@/core/panels/registry'
import { getPanelIconComponent } from '@/settings/panelIcons'

describe('panel icons', () => {
  it('uses distinct camera, camera-parameter and hexadecimal message icons', () => {
    expect(getPanelIconComponent('camera')).toBe(Camera)
    expect(getPanelIconComponent('camera-config')).toBe(Operation)
    expect(getPanelById('camera-parameters')?.action).toBe('camera-config')
    expect(getPanelById('motor-parameters')?.action).toBe('hex-message')
    expect(componentBadgeSvg('hex-message')).toContain('>HEX</text>')
  })
})
