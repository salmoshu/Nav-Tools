import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dialogPath = 'src/components/windows/common/IapUpgradeDialog.vue'
const source = readFileSync(dialogPath, 'utf8')
const globalStyles = readFileSync('src/style.css', 'utf8')

describe('IAP upgrade dialog viewport containment', () => {
  it('uses the shared app-dialog shell so the dialog never exceeds the viewport', () => {
    expect(source).toContain('class="app-dialog"')
    expect(source).toContain('align-center')

    const shell = globalStyles.match(/\.el-dialog\.app-dialog\s*\{([^}]*)\}/)?.[1]
    expect(shell).toBeDefined()
    expect(shell).toContain('max-height: calc(100vh - 32px)')
    expect(shell).toContain('overflow: hidden')

    const body = globalStyles.match(/\.app-dialog \.el-dialog__body\s*\{([^}]*)\}/)?.[1]
    expect(body).toBeDefined()
    expect(body).toContain('overflow: auto')
    expect(body).toContain('min-height: 0')
  })

  it('does not keep a local height cap that made the overlay (main window) scroll', () => {
    const local = source.match(/\.iap-dialog-body\s*\{([^}]*)\}/)?.[1]
    expect(local).toBeDefined()
    expect(local).not.toContain('max-height')
    expect(local).not.toContain('overflow')
    expect(source).not.toContain('max-height: 70vh')
  })
})

describe('IAP upgrade log collapse', () => {
  it('is collapsible and collapsed by default, with state kept inside the component', () => {
    expect(source).toContain('const logExpanded = ref(false)')
    expect(source).toContain(':aria-expanded="logExpanded"')
    expect(source).toContain('@click="logExpanded = !logExpanded"')
    expect(source).toContain('class="iap-log-toggle"')
    // The toggle state stays component-local: nothing persists or watches it.
    expect(source).not.toContain('watch(logExpanded')
    expect(source).not.toMatch(/localStorage[^\n]*logExpanded|logExpanded[^\n]*localStorage/)
  })

  it('renders a chevron that points right while collapsed and down when expanded', () => {
    expect(source).toContain('class="iap-log-chevron" :class="{ expanded: logExpanded }"')
    const chevron = source.match(/\.iap-log-chevron\s*\{([^}]*)\}/)?.[1]
    expect(chevron).toContain('transform: rotate(-90deg)')
    const chevronOpen = source.match(/\.iap-log-chevron\.expanded\s*\{([^}]*)\}/)?.[1]
    expect(chevronOpen).toContain('transform: rotate(0deg)')
  })

  it('animates expand/collapse with brand motion tokens inside the 150-300ms range', () => {
    const collapse = source.match(/\.iap-log-collapse\s*\{([^}]*)\}/)?.[1]
    expect(collapse).toContain('display: grid')
    expect(collapse).toContain('grid-template-rows: 0fr')
    expect(collapse).toContain(
      'transition: grid-template-rows var(--app-duration-panel) var(--app-ease-out)',
    )
    expect(source).toContain('grid-template-rows: 1fr')

    const tokens = readFileSync('src/styles/kimi-tokens.css', 'utf8')
    expect(tokens).toContain('--duration-panel: 300ms')
    expect(tokens).toContain('--duration-default: 150ms')
  })

  it('keeps the upgrade progress bar always visible outside the collapsible area', () => {
    const progressIndex = source.indexOf('class="iap-section progress-section"')
    const logIndex = source.indexOf('class="iap-log-section"')
    expect(progressIndex).toBeGreaterThan(-1)
    expect(logIndex).toBeGreaterThan(-1)
    expect(progressIndex).toBeLessThan(logIndex)

    const progressSection = source.slice(progressIndex, logIndex)
    expect(progressSection).toContain('<el-progress')
    expect(progressSection).not.toContain('logExpanded')

    const collapseStart = source.indexOf('class="iap-log-collapse"')
    const collapseEnd = source.indexOf('</section>', collapseStart)
    expect(source.slice(collapseStart, collapseEnd)).not.toContain('el-progress')
  })

  it('keeps the log auto-scroll target inside the collapsible panel', () => {
    const collapseStart = source.indexOf('class="iap-log-collapse"')
    const collapseEnd = source.indexOf('</section>', collapseStart)
    expect(source.slice(collapseStart, collapseEnd)).toContain('ref="logElement"')
    expect(source).toContain('logElement.value.scrollTop = logElement.value.scrollHeight')
  })

  it('provides bilingual labels for the collapse toggle', () => {
    const zh = readFileSync('src/i18n/locales/zh-CN/common.ts', 'utf8')
    const en = readFileSync('src/i18n/locales/en-US/common.ts', 'utf8')
    expect(zh).toContain('expandLog:')
    expect(zh).toContain('collapseLog:')
    expect(en).toContain('expandLog:')
    expect(en).toContain('collapseLog:')
  })
})
