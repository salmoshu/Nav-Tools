import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const terminalSource = readFileSync('src/components/windows/common/Terminal.vue', 'utf8')
const paneSource = readFileSync('src/components/windows/common/TerminalPane.vue', 'utf8')
const terminalServiceSource = readFileSync('electron/main/services/TerminalService.ts', 'utf8')
const sftpSource = readFileSync('src/components/windows/common/TerminalSftpPanel.vue', 'utf8')
const terminalThemeSource = readFileSync('src/core/terminal/TerminalTheme.ts', 'utf8')

describe('Terminal v1.4.1 visual controls', () => {
  it('uses Orca Ghostty colors for the terminal and ANSI output', () => {
    expect(paneSource).toContain('...ORCA_TERMINAL_THEME')
    expect(terminalThemeSource).toContain("background: '#282c34'")
    expect(terminalThemeSource).toContain("foreground: '#ffffff'")
    expect(terminalThemeSource).toContain("red: '#cc6666'")
    expect(terminalThemeSource).toContain("green: '#b5bd68'")
    expect(terminalThemeSource).toContain("yellow: '#f0c674'")
    expect(terminalThemeSource).toContain("brightBlue: '#7aa6da'")
    expect(terminalThemeSource).toContain("brightMagenta: '#c397d8'")
    expect(terminalThemeSource).toContain("brightCyan: '#70c0b1'")
  })

  it('uses only real output for tab activity and ignores hidden overlays for shortcuts', () => {
    expect(terminalSource).toContain('value.activity === false')
    expect(terminalSource).toContain('hasVisibleTerminalOverlay()')
    expect(terminalSource).not.toContain("document.querySelector('.el-overlay')")
  })

  it('does not inject a visible PROMPT_COMMAND into restored SSH shells', () => {
    expect(terminalServiceSource).not.toContain('const startupCommands = [OSC7_PROMPT_EXPORT]')
    expect(terminalServiceSource).not.toContain('stream.write(`${startupCommands.join')
  })
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

  it('supports tab reordering and exposes one SFTP control at tab scope', () => {
    expect(terminalSource).toContain('<draggable')
    expect(terminalSource).toContain('v-model="tabs"')
    expect(terminalSource).toContain('item-key="id"')
    expect(terminalSource).toContain('class="terminal-tab-content__layout"')
    expect(terminalSource).toContain('<TerminalSftpPanel')
    expect(terminalSource).toContain('class="tab-action tab-action--sftp"')
    expect(terminalSource).toContain('@click="toggleActiveTabSftp"')
    expect(paneSource).not.toContain('<TerminalSftpPanel')
    expect(paneSource).not.toContain("t('common.terminal.openSftp')")
    expect(paneSource).not.toContain("emit('toggle-sftp', props.pane.id)")
  })

  it('removes the floating port-forward control and keeps reconnect at the terminal bottom', () => {
    expect(paneSource).not.toContain('forwardVisible')
    expect(paneSource).not.toContain('terminal-forward-start')
    expect(paneSource).toContain('class="session-disconnected"')
    expect(paneSource).toContain(
      '.session-body {\n  position: relative;\n  min-height: 0;\n  flex: 1;\n  display: flex;\n  flex-direction: column;',
    )
    expect(paneSource).not.toContain('.session-disconnected {\n  position: absolute;')
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
