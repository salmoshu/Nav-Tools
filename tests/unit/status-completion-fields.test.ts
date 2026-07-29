import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('StatusView formula field completions', () => {
  const statusView = readFileSync('src/components/StatusBar.vue', 'utf8')
  const manager = readFileSync('src/composables/useStatusManager.ts', 'utf8')

  it('replaces completion fields whenever numeric candidates change', () => {
    expect(statusView).toContain('setMonacoFieldWords(newFields)')
    expect(statusView).toMatch(
      /watch\(availableFields,[\s\S]*?setMonacoFieldWords\(newFields\)[\s\S]*?immediate:\s*true/,
    )
  })

  it('rebuilds field hints instead of retaining removed text fields', () => {
    expect(manager).toContain('function setMonacoFieldWords(labels: string[])')
    expect(manager).toContain('customHints.value = [...BASE_COMPLETION_HINTS, ...fieldHints]')
    expect(manager).not.toContain('function addMonacoWords(')
  })
})
