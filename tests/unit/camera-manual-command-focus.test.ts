import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const cameraParametersSource = readFileSync('src/components/windows/common/CameraParameters.vue', 'utf8')

describe('v1.7.13 camera manual command focus restore', () => {
  it('keeps the command textarea focusable after Ctrl+Enter send', () => {
    // 发送期间 :disabled="sending" 会令 textarea 失焦;发送完成后必须主动还回焦点,
    // 否则手动标定连续输入时每次都要用鼠标点回输入区
    expect(cameraParametersSource).toContain('ref="contentInput"')
    expect(cameraParametersSource).toContain('const contentInput = ref')
    expect(cameraParametersSource).toContain('nextTick().then(() => contentInput.value?.focus())')
  })
})
