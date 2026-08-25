import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const terminalSource = readFileSync('src/components/windows/common/Terminal.vue', 'utf8')
const paneSource = readFileSync('src/components/windows/common/TerminalPane.vue', 'utf8')
const sftpSource = readFileSync('src/components/windows/common/TerminalSftpPanel.vue', 'utf8')

describe('Terminal v1.4.1 visual controls', () => {
  it('keeps the tab status dot centered and places add-tab beside the last tab', () => {
    const stripStart = terminalSource.indexOf('class="terminal-tabs__strip"')
    const actionsStart = terminalSource.indexOf('class="terminal-tabs__actions"')
    const addTabStart = terminalSource.indexOf('class="terminal-tab-add"')

    expect(stripStart).toBeGreaterThanOrEqual(0)
    expect(addTabStart).toBeGreaterThan(stripStart)
    expect(addTabStart).toBeLessThan(actionsStart)
    expect(terminalSource).toContain('@command="addTerminalTab"')
    expect(terminalSource).toContain('v-for="shell in capabilities.localShells"')
    expect(terminalSource).toContain('v-for="distro in capabilities.wslDistros"')
    expect(terminalSource).toContain('command="ssh"')
    expect(terminalSource).toContain('class="tab-status-dot"')
    expect(terminalSource).toContain('.tab-leading {\n  display: flex;\n  align-items: center;')
    expect(terminalSource).toContain('.tab-status-dot {\n  width: 7px;\n  height: 7px;')
  })

  it('offers direct right and down split buttons for every pane', () => {
    expect(paneSource).not.toContain('<el-dropdown')
    expect(paneSource).toContain('class="pane-action pane-action--split-right"')
    expect(paneSource).toContain('class="pane-action pane-action--split-down"')
    expect(paneSource).toContain(
      '@click="emitSplit(\'horizontal\', Boolean(props.pane.sessionId))"',
    )
    expect(paneSource).toContain('@click="emitSplit(\'vertical\', Boolean(props.pane.sessionId))"')
    expect(paneSource).toContain('.pane-action--split-right :deep(svg)')
    expect(paneSource).toContain('transform: rotate(90deg);')
  })

  it('makes the SFTP panel width draggable with bounded feedback', () => {
    expect(sftpSource).toContain(':style="{ width: `${panelWidth}px` }"')
    expect(sftpSource).toContain('class="sftp-resizer"')
    expect(sftpSource).toContain('@pointerdown="startResize"')
    expect(sftpSource).toContain('@pointermove="resizeWithPointer"')
    expect(sftpSource).toContain('@pointerup="finishResize"')
    expect(sftpSource).toContain('function clampPanelWidth')
    expect(sftpSource).toContain('.sftp-resizer.dragging::after')
    expect(sftpSource).toContain('cursor: col-resize;')
  })
})
