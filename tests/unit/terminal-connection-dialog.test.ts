import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reactive, toRaw } from 'vue'
import { createPortForwardRule } from '@/core/terminal/TerminalTypes'
import { createSshProfile } from '@/core/terminal/TerminalProfileStorage'

describe('Terminal SSH connection dialog', () => {
  it('unwraps the reactive form before cloning its connection profile', () => {
    const source = readFileSync(
      'src/components/windows/common/TerminalConnectionDialog.vue',
      'utf8',
    )

    expect(source).toContain("import { computed, reactive, ref, toRaw, watch } from 'vue'")
    expect(source).toContain('const rawProfile = toRaw(profile)')
    expect(source).toContain('const profile = cloneProfile(form)')
    expect(source).not.toContain('structuredClone(form)')
  })

  it('produces a cloneable plain profile from a reactive form', () => {
    const form = reactive(createSshProfile())
    form.forwards.push(createPortForwardRule('local'))

    expect(() => structuredClone(form)).toThrow()

    const rawProfile = toRaw(form)
    const profile = {
      ...rawProfile,
      forwards: rawProfile.forwards.map((rule) => ({ ...toRaw(rule) })),
    }

    expect(() => structuredClone(profile)).not.toThrow()
    expect(profile).not.toBe(form)
    expect(profile.forwards).not.toBe(form.forwards)
  })

  it('keeps the dialog visible while the parent owns the asynchronous connection attempt', () => {
    const source = readFileSync(
      'src/components/windows/common/TerminalConnectionDialog.vue',
      'utf8',
    )
    const connectHandler = source.slice(
      source.indexOf('function connect(): void'),
      source.indexOf('function cloneProfile'),
    )

    expect(source).toContain(':loading="connecting"')
    expect(source).toContain('v-else-if="connecting" class="connection-progress"')
    expect(source).toContain('v-if="connectionError"')
    expect(connectHandler).toContain("emit(\n    'connect'")
    expect(connectHandler).not.toContain('visible.value = false')
  })

  it('uses the shared dialog shell and compact advanced sections', () => {
    const source = readFileSync(
      'src/components/windows/common/TerminalConnectionDialog.vue',
      'utf8',
    )

    expect(source).toContain('class="app-dialog terminal-connection-dialog"')
    expect(source).toContain('<el-collapse v-model="expandedSections"')
    expect(source).toContain('class="forward-empty"')
    expect(source).not.toContain('<el-empty')
  })
})
