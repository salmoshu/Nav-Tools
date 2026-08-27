import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('v1.4.2 UI regressions', () => {
  it('animates the serial-port refresh icon for the complete refresh operation', () => {
    const toolbar = readFileSync('src/components/ToolBar.vue', 'utf8')
    const device = readFileSync('src/hooks/useDevice.ts', 'utf8')

    expect(toolbar).toContain('@click="refreshSerialPorts"')
    expect(toolbar).toContain("'is-refreshing': serialPortsRefreshing")
    expect(toolbar).toContain('@keyframes serial-refresh-spin')
    expect(device).toContain('const searchSerialPorts = async')
    expect(device).toContain('await serialService.listPorts()')
  })

  it('offers interrupt and encrypted credential-memory controls in the SSH dialog', () => {
    const dialog = readFileSync(
      'src/components/windows/common/TerminalConnectionDialog.vue',
      'utf8',
    )

    expect(dialog).toContain('cancel: []')
    expect(dialog).toContain("emit('cancel')")
    expect(dialog).toContain('v-model="rememberCredentials"')
    expect(dialog).toContain("'terminal-credential-load'")
  })
})
