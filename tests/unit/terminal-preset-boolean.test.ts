/* eslint-disable vue/one-component-per-file -- Element Plus 测试桩集中放置，避免引入组件测试依赖 */
import { createApp, defineComponent, h, nextTick, type App, type PropType } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TERMINAL_TRANSLATE_KEY, type TerminalTranslate } from '@/core/terminal/TerminalI18n'
import { TerminalPresetStorage, createTerminalPreset } from '@/core/terminal/TerminalPresetStorage'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import TerminalPresetPanel from '../../src/components/windows/common/TerminalPresetPanel.vue'

const translate: TerminalTranslate = (key) => key

const Passthrough = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, [slots.default?.(), slots.footer?.()])
  },
})

const ButtonStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

const CheckboxStub = defineComponent({
  props: {
    modelValue: { type: String, required: true },
    trueValue: { type: String, default: 'true' },
    falseValue: { type: String, default: 'false' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () =>
      h('label', [
        h('input', {
          type: 'checkbox',
          checked: props.modelValue === props.trueValue,
          onChange: (event: Event) => {
            const checked = (event.target as HTMLInputElement).checked
            emit('update:modelValue', checked ? props.trueValue : props.falseValue)
          },
        }),
        slots.default?.(),
      ])
  },
})

const InputStub = defineComponent({
  props: { modelValue: { type: String as PropType<string>, default: '' } },
  setup(props) {
    return () => h('input', { value: props.modelValue })
  },
})

function mountPanel(): { app: App; host: HTMLDivElement } {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(TerminalPresetPanel, { sessionId: 'session-1' })
  app.provide(TERMINAL_TRANSLATE_KEY, translate)
  for (const name of ['ElDialog', 'ElForm', 'ElFormItem', 'ElIcon', 'ElTooltip']) {
    app.component(name, Passthrough)
  }
  app.component('ElButton', ButtonStub)
  app.component('ElCheckbox', CheckboxStub)
  app.component('ElInput', InputStub)
  app.component('ElSelect', Passthrough)
  app.component('ElOption', Passthrough)
  app.mount(host)
  return { app, host }
}

describe('TerminalPresetPanel boolean parameters', () => {
  let mounted: { app: App; host: HTMLDivElement } | undefined

  beforeEach(() => {
    localStorage.clear()
    new TerminalPresetStorage(localStorage).save({
      ...createTerminalPreset(),
      name: 'deploy',
      command: 'deploy --force={{force:bool}}',
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { invoke: vi.fn().mockResolvedValue(undefined) },
    })
  })

  afterEach(() => {
    mounted?.app.unmount()
    mounted = undefined
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('renders a checkbox and submits its canonical value', async () => {
    mounted = mountPanel()

    ;(mounted.host.querySelector('.preset-item__actions button') as HTMLButtonElement).click()
    await nextTick()

    const checkbox = mounted.host.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox).not.toBeNull()
    expect(checkbox.checked).toBe(false)

    checkbox.click()
    await nextTick()
    const runButton = Array.from(mounted.host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('common.terminal.presetRun'),
    )
    expect(runButton).toBeDefined()
    runButton!.click()
    await nextTick()

    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith('terminal-session-run-command', {
      sessionId: 'session-1',
      command: 'deploy --force={{force:bool}}',
      cwd: undefined,
      values: { force: 'true' },
    })
  })
})
