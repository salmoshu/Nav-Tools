import { describe, expect, it } from 'vitest'
import { TerminalScreenMode } from '@/core/terminal/TerminalScreenMode'

describe('TerminalScreenMode', () => {
  it.each(['47', '1047', '1049'])('tracks alternate screen mode %s', (mode) => {
    const screen = new TerminalScreenMode()
    expect(screen.feed(`prompt\x1b[?${mode}h`)).toBe(true)
    expect(screen.feed(`\x1b[?${mode}l`)).toBe(false)
  })

  it('handles several private modes in one sequence', () => {
    const screen = new TerminalScreenMode()
    expect(screen.feed('\x1b[?2004;1049h')).toBe(true)
    expect(screen.feed('\x1b[?2004l')).toBe(true)
    expect(screen.feed('\x1b[?2004;1049l')).toBe(false)
  })

  it('handles control sequences split across output frames', () => {
    const screen = new TerminalScreenMode()
    expect(screen.feed('vim\x1b')).toBe(false)
    expect(screen.feed('[?10')).toBe(false)
    expect(screen.feed('49h')).toBe(true)
    expect(screen.feed('\x1b[?1049')).toBe(true)
    expect(screen.feed('l')).toBe(false)
  })

  it('ignores non-private cursor modes and resets for a new attachment', () => {
    const screen = new TerminalScreenMode()
    screen.feed('\x1b[?25h\x1b[4h')
    expect(screen.isAlternateScreen).toBe(false)
    screen.feed('\x1b[?1049h')
    screen.reset()
    expect(screen.isAlternateScreen).toBe(false)
  })
})
