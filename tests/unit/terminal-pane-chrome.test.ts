import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Terminal pane chrome', () => {
  const paneSource = readFileSync('src/components/windows/common/TerminalPane.vue', 'utf8').replace(
    /\r\n/g,
    '\n',
  )
  const workbenchSource = readFileSync('src/components/windows/common/Terminal.vue', 'utf8').replace(
    /\r\n/g,
    '\n',
  )

  it('moves the pane controls into an overlay instead of consuming a second row', () => {
    expect(paneSource).toContain('.pane-header {\n  position: absolute;')
    expect(paneSource).not.toContain('class="pane-title"')
    expect(paneSource).toContain(
      'v-if="paneCount > 1"\n          :content="t(\'common.terminal.closePaneShortcut\')"',
    )
    expect(paneSource).toContain(':aria-label="t(\'common.terminal.closePaneShortcut\')"')
  })

  it('shows the focused session title in the first-level tab', () => {
    expect(workbenchSource).toContain('tabDisplayTitle(tab)')
    expect(workbenchSource).toContain('function tabDisplayTitle(tab: TerminalTabLayout): string')
    expect(workbenchSource).toContain('sessionInfos.value[focusedPane.sessionId]?.title')
  })
})
