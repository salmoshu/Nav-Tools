import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decideCardWindowClose, isCloseConfirmPending } from '../../electron/main/cardWindowClose'

describe('decideCardWindowClose', () => {
  it('allows closing non-Terminal panels and windows without live sessions', () => {
    expect(decideCardWindowClose(undefined, 0)).toBe('allow')
    expect(decideCardWindowClose({ componentName: 'Plot' }, 3)).toBe('allow')
    expect(decideCardWindowClose({ componentName: 'Terminal' }, 0)).toBe('allow')
  })

  it('allows an already-confirmed window to close even with live sessions', () => {
    expect(decideCardWindowClose({ componentName: 'Terminal', closeConfirmed: true }, 2)).toBe(
      'allow',
    )
  })

  it('asks the renderer to confirm when a Terminal window has live sessions', () => {
    expect(decideCardWindowClose({ componentName: 'Terminal' }, 2)).toBe('confirm')
  })

  it('swallows repeat close attempts while a confirmation is pending', () => {
    expect(decideCardWindowClose({ componentName: 'Terminal', closeInProgress: true }, 2)).toBe(
      'wait',
    )
  })
})

describe('isCloseConfirmPending', () => {
  it('accepts only a Terminal panel with a pending confirmation', () => {
    expect(isCloseConfirmPending(undefined)).toBe(false)
    expect(isCloseConfirmPending({ componentName: 'Plot', closeInProgress: true })).toBe(false)
    expect(isCloseConfirmPending({ componentName: 'Terminal' })).toBe(false)
    expect(
      isCloseConfirmPending({
        componentName: 'Terminal',
        closeInProgress: true,
        closeConfirmed: true,
      }),
    ).toBe(false)
    expect(isCloseConfirmPending({ componentName: 'Terminal', closeInProgress: true })).toBe(true)
  })
})

describe('card window close confirmation wiring', () => {
  it('replaces the native message box with renderer-side confirmation', () => {
    const main = readFileSync('electron/main/index.ts', 'utf8')
    expect(main).not.toContain('dialog.showMessageBox')
    expect(main).toContain("webContents.send('card-window-close-request')")
    expect(main).toContain("ipcMain.handle('card-window-close-request-pending'")
    expect(main).toContain("ipcMain.handle('card-window-close-response'")
    expect(main).toContain('decideCardWindowClose')
    expect(main).toContain('terminalService.closeAll()')
  })

  it('shows a localized in-app confirmation in the card window renderer', () => {
    const cardWindow = readFileSync('src/components/CardWindow.vue', 'utf8')
    expect(cardWindow).toContain('ElMessageBox.confirm')
    expect(cardWindow).toContain("on('card-window-close-request'")
    expect(cardWindow).toContain("off('card-window-close-request'")
    expect(cardWindow).toContain("invoke('card-window-close-response'")
    expect(cardWindow).toContain("invoke('card-window-close-request-pending')")
    expect(cardWindow).toContain("t('common.terminal.closeWindowConfirm')")
    expect(cardWindow).toContain("t('common.terminal.closeWindowTitle')")
  })

  it('localizes the confirmation copy for zh-CN and en-US', () => {
    const zh = readFileSync('src/i18n/locales/zh-CN/common.ts', 'utf8')
    const en = readFileSync('src/i18n/locales/en-US/common.ts', 'utf8')
    expect(zh).toContain("closeWindowTitle: '关闭终端'")
    expect(zh).toContain('closeWindowConfirm:')
    expect(en).toContain("closeWindowTitle: 'Close Terminal'")
    expect(en).toContain('closeWindowConfirm:')
  })
})
