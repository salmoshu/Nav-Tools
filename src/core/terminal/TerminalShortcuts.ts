import type { StorageLike } from '@/core/storage/JsonStorage'

export type TerminalShortcutAction =
  | { type: 'new-tab' }
  | { type: 'close-active' }
  | { type: 'next-tab' }
  | { type: 'previous-tab' }
  | { type: 'select-tab'; index: number }
  | { type: 'focus-next-pane' }
  | { type: 'focus-previous-pane' }
  | { type: 'split-right' }
  | { type: 'split-down' }
  | { type: 'toggle-expand-pane' }

export type TerminalShortcutCommandId =
  | 'new-tab'
  | 'close-active'
  | 'next-tab'
  | 'previous-tab'
  | 'select-tab'
  | 'focus-next-pane'
  | 'focus-previous-pane'
  | 'split-right'
  | 'split-down'
  | 'toggle-expand-pane'

export type TerminalShortcutPlatform = 'win32' | 'darwin' | 'linux'

export interface TerminalShortcutInput {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat?: boolean
}

/** A serializable keyboard chord. `Digit` is a special key matching 1 through 9. */
export interface TerminalShortcutBinding {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type TerminalShortcutMap = Record<TerminalShortcutCommandId, TerminalShortcutBinding[]>

export interface TerminalShortcutDefinition {
  id: TerminalShortcutCommandId
  category: 'terminal'
  labelKey: string
}

export const TERMINAL_SHORTCUTS_STORAGE_KEY = 'nav-tools:terminal-shortcuts:v1'

export const TERMINAL_SHORTCUT_DEFINITIONS: readonly TerminalShortcutDefinition[] = [
  { id: 'new-tab', category: 'terminal', labelKey: 'common.terminal.shortcutNewTab' },
  { id: 'close-active', category: 'terminal', labelKey: 'common.terminal.shortcutClose' },
  { id: 'next-tab', category: 'terminal', labelKey: 'common.terminal.shortcutNextTab' },
  { id: 'previous-tab', category: 'terminal', labelKey: 'common.terminal.shortcutPreviousTab' },
  { id: 'select-tab', category: 'terminal', labelKey: 'common.terminal.shortcutSelectTab' },
  {
    id: 'focus-next-pane',
    category: 'terminal',
    labelKey: 'common.terminal.shortcutFocusNextPane',
  },
  {
    id: 'focus-previous-pane',
    category: 'terminal',
    labelKey: 'common.terminal.shortcutFocusPreviousPane',
  },
  { id: 'split-right', category: 'terminal', labelKey: 'common.terminal.shortcutSplitRight' },
  { id: 'split-down', category: 'terminal', labelKey: 'common.terminal.shortcutSplitDown' },
  {
    id: 'toggle-expand-pane',
    category: 'terminal',
    labelKey: 'common.terminal.shortcutExpandPane',
  },
]

export interface TerminalShortcutCommand {
  id: TerminalShortcutCommandId
  category: 'terminal'
  labelKey: string
  bindings: TerminalShortcutBinding[]
}

export type TerminalShortcutUpdateErrorCode =
  'invalid-binding' | 'conflict' | 'unknown-command' | 'invalid-index'

export interface TerminalShortcutUpdateError {
  code: TerminalShortcutUpdateErrorCode
  message: string
  commandId?: TerminalShortcutCommandId
  bindingIndex?: number
}

export type TerminalShortcutUpdateResult =
  { ok: true; binding: TerminalShortcutBinding } | { ok: false; error: TerminalShortcutUpdateError }

export interface TerminalShortcutValidationIssue {
  code: 'invalid-binding' | 'conflict'
  commandId: TerminalShortcutCommandId
  bindingIndex: number
  message: string
}

export interface TerminalShortcutValidationResult {
  valid: boolean
  issues: TerminalShortcutValidationIssue[]
}

/** Normalize Electron's process.platform/navigator platform to the persisted profiles. */
export function normalizeTerminalShortcutPlatform(platform: string): TerminalShortcutPlatform {
  const normalized = platform.toLowerCase()
  if (normalized === 'darwin' || normalized.includes('mac')) return 'darwin'
  if (normalized === 'linux' || normalized.includes('linux')) return 'linux'
  return 'win32'
}

function createBinding(
  key: string,
  modifiers: Partial<Omit<TerminalShortcutBinding, 'key' | 'code'>> = {},
  code?: string,
): TerminalShortcutBinding {
  return {
    key,
    ...(code ? { code } : {}),
    ctrlKey: modifiers.ctrlKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    altKey: modifiers.altKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
  }
}

/** Return the complete built-in map for a platform. The returned map is always mutable by the caller. */
export function createDefaultTerminalShortcutMap(platform: string): TerminalShortcutMap {
  const normalizedPlatform = normalizeTerminalShortcutPlatform(platform)
  const isMac = normalizedPlatform === 'darwin'
  const primary = isMac ? { metaKey: true } : { ctrlKey: true }

  return {
    'new-tab': [createBinding('t', primary, 'KeyT')],
    'close-active': [createBinding('w', primary, 'KeyW')],
    'next-tab': [
      createBinding('Tab', { ctrlKey: true }, 'Tab'),
      createBinding('PageDown', { ctrlKey: true }, 'PageDown'),
    ],
    'previous-tab': [
      createBinding('Tab', { ctrlKey: true, shiftKey: true }, 'Tab'),
      createBinding('PageUp', { ctrlKey: true }, 'PageUp'),
    ],
    'select-tab': [createBinding('Digit', isMac ? { ctrlKey: true } : { altKey: true })],
    'focus-next-pane': [createBinding(']', primary, 'BracketRight')],
    'focus-previous-pane': [createBinding('[', primary, 'BracketLeft')],
    'split-right': [
      createBinding('d', isMac ? { metaKey: true } : { ctrlKey: true, shiftKey: true }, 'KeyD'),
    ],
    'split-down': [
      createBinding(
        'd',
        isMac ? { metaKey: true, shiftKey: true } : { altKey: true, shiftKey: true },
        'KeyD',
      ),
    ],
    'toggle-expand-pane': [createBinding('Enter', { ...primary, shiftKey: true }, 'Enter')],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  spacebar: 'Space',
  ' ': 'Space',
}

function normalizeKey(value: string): string {
  const trimmed = value.trim()
  return KEY_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

function normalizeCode(value: string): string {
  return value.trim()
}

function hasModifier(binding: TerminalShortcutBinding): boolean {
  return binding.ctrlKey || binding.metaKey || binding.altKey || binding.shiftKey
}

function isModifierOnlyKey(key: string): boolean {
  return ['Control', 'Meta', 'Alt', 'Shift', 'OS', 'Fn', 'Hyper'].includes(key)
}

/** Parse and validate untrusted settings/UI input into a serializable keyboard chord. */
export function parseTerminalShortcutBinding(
  input: unknown,
): { ok: true; binding: TerminalShortcutBinding } | { ok: false; message: string } {
  if (!isRecord(input) || typeof input.key !== 'string') {
    return { ok: false, message: 'A shortcut key is required' }
  }

  const key = input.key === ' ' ? 'Space' : normalizeKey(input.key)
  if (!key || key.length > 64 || isModifierOnlyKey(key)) {
    return { ok: false, message: 'The shortcut key is invalid' }
  }

  const modifierNames = ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const
  const modifiers = {} as Pick<TerminalShortcutBinding, (typeof modifierNames)[number]>
  for (const name of modifierNames) {
    const value = input[name]
    if (value !== undefined && typeof value !== 'boolean') {
      return { ok: false, message: 'Shortcut modifiers must be boolean values' }
    }
    modifiers[name] = value === true
  }

  const codeValue = input.code
  if (codeValue !== undefined && typeof codeValue !== 'string') {
    return { ok: false, message: 'The shortcut code is invalid' }
  }
  const code = typeof codeValue === 'string' ? normalizeCode(codeValue) : undefined
  if (code !== undefined && (!code || code.length > 64)) {
    return { ok: false, message: 'The shortcut code is invalid' }
  }

  const binding = { key, ...(code ? { code } : {}), ...modifiers }
  if (!hasModifier(binding)) {
    return { ok: false, message: 'A shortcut must include at least one modifier' }
  }
  return { ok: true, binding }
}

function parseBindingForCommand(
  commandId: TerminalShortcutCommandId,
  input: unknown,
): { ok: true; binding: TerminalShortcutBinding } | { ok: false; message: string } {
  const parsed = parseTerminalShortcutBinding(input)
  if (!parsed.ok || commandId !== 'select-tab') return parsed
  if (parsed.binding.key === 'Digit') return parsed
  if (/^[1-9]$/.test(parsed.binding.key) || /^Digit[1-9]$/.test(parsed.binding.code ?? '')) {
    return { ok: true, binding: { ...parsed.binding, key: 'Digit' } }
  }
  return { ok: false, message: 'Select-tab must use the 1-9 digit key pattern' }
}

function cloneBinding(binding: TerminalShortcutBinding): TerminalShortcutBinding {
  return { ...binding }
}

function cloneMap(map: TerminalShortcutMap): TerminalShortcutMap {
  return Object.fromEntries(
    TERMINAL_SHORTCUT_DEFINITIONS.map(({ id }) => [id, map[id].map(cloneBinding)]),
  ) as TerminalShortcutMap
}

function bindingIdentityParts(binding: TerminalShortcutBinding): string[] {
  const modifiers = [
    binding.ctrlKey ? 'C' : '',
    binding.metaKey ? 'M' : '',
    binding.altKey ? 'A' : '',
    binding.shiftKey ? 'S' : '',
  ].join('')
  const key = normalizeKey(binding.key).toLowerCase()
  const identities = [`${modifiers}|key:${key}`]
  if (binding.code)
    identities.push(`${modifiers}|code:${normalizeCode(binding.code).toLowerCase()}`)
  return identities
}

function digitFromInput(event: TerminalShortcutInput): number | null {
  const fromKey = /^([1-9])$/.exec(event.key)
  if (fromKey) return Number(fromKey[1])
  const fromCode = /^Digit([1-9])$/.exec(event.code ?? '')
  return fromCode ? Number(fromCode[1]) : null
}

function matchesBinding(binding: TerminalShortcutBinding, event: TerminalShortcutInput): boolean {
  if (
    binding.ctrlKey !== event.ctrlKey ||
    binding.metaKey !== event.metaKey ||
    binding.altKey !== event.altKey ||
    binding.shiftKey !== event.shiftKey
  )
    return false

  if (binding.key === 'Digit') return digitFromInput(event) !== null
  if (binding.code && event.code) return normalizeCode(binding.code) === normalizeCode(event.code)
  return normalizeKey(binding.key).toLowerCase() === normalizeKey(event.key).toLowerCase()
}

function actionForCommand(
  commandId: TerminalShortcutCommandId,
  event: TerminalShortcutInput,
): TerminalShortcutAction | null {
  if (commandId === 'select-tab') {
    const digit = digitFromInput(event)
    return digit === null ? null : { type: 'select-tab', index: digit - 1 }
  }
  return { type: commandId }
}

/** Validate a complete map at the module seam, including duplicate chords across commands. */
export function validateTerminalShortcutMap(map: unknown): TerminalShortcutValidationResult {
  const issues: TerminalShortcutValidationIssue[] = []
  if (!isRecord(map)) {
    return {
      valid: false,
      issues: TERMINAL_SHORTCUT_DEFINITIONS.map(({ id }) => ({
        code: 'invalid-binding',
        commandId: id,
        bindingIndex: 0,
        message: 'Shortcut map is invalid',
      })),
    }
  }

  const seen = new Map<string, { commandId: TerminalShortcutCommandId; bindingIndex: number }>()
  for (const { id } of TERMINAL_SHORTCUT_DEFINITIONS) {
    const rawBindings = map[id]
    if (!Array.isArray(rawBindings) || rawBindings.length === 0) {
      issues.push({
        code: 'invalid-binding',
        commandId: id,
        bindingIndex: 0,
        message: 'Each terminal action must have at least one shortcut',
      })
      continue
    }

    rawBindings.forEach((rawBinding, bindingIndex) => {
      const parsed = parseTerminalShortcutBinding(rawBinding)
      if (!parsed.ok) {
        issues.push({
          code: 'invalid-binding',
          commandId: id,
          bindingIndex,
          message: parsed.message,
        })
        return
      }
      if (id === 'select-tab' && parsed.binding.key !== 'Digit') {
        issues.push({
          code: 'invalid-binding',
          commandId: id,
          bindingIndex,
          message: 'Select-tab must use the 1-9 digit key pattern',
        })
        return
      }
      for (const identity of bindingIdentityParts(parsed.binding)) {
        const previous = seen.get(identity)
        if (previous) {
          issues.push({
            code: 'conflict',
            commandId: id,
            bindingIndex,
            message: `Shortcut conflicts with ${previous.commandId}`,
          })
          break
        }
        seen.set(identity, { commandId: id, bindingIndex })
      }
    })
  }
  return { valid: issues.length === 0, issues }
}

function mapAction(
  map: TerminalShortcutMap,
  event: TerminalShortcutInput,
): TerminalShortcutAction | null {
  if (event.repeat) return null
  for (const { id } of TERMINAL_SHORTCUT_DEFINITIONS) {
    for (const binding of map[id]) {
      if (!matchesBinding(binding, event)) continue
      const action = actionForCommand(id, event)
      if (action) return action
    }
  }
  return null
}

/** Resolve an event against an explicit map; useful for non-persistent consumers and tests. */
export function resolveConfiguredTerminalShortcut(
  event: TerminalShortcutInput,
  platform: string,
  map: TerminalShortcutMap = createDefaultTerminalShortcutMap(platform),
): TerminalShortcutAction | null {
  // The platform is part of this seam so callers can pass Electron's process.platform while
  // retaining a platform-specific default map. Persisted maps already contain exact modifiers.
  void platform
  return mapAction(map, event)
}

function readPersistedPlatforms(storage: StorageLike): Record<string, unknown> {
  try {
    const raw = storage.getItem(TERMINAL_SHORTCUTS_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.platforms)) return {}
    return parsed.platforms
  } catch {
    return {}
  }
}

function loadMap(storage: StorageLike, platform: TerminalShortcutPlatform): TerminalShortcutMap {
  const map = createDefaultTerminalShortcutMap(platform)
  const rawProfile = readPersistedPlatforms(storage)[platform]
  if (!isRecord(rawProfile)) return map

  for (const { id } of TERMINAL_SHORTCUT_DEFINITIONS) {
    const rawBindings = rawProfile[id]
    if (!Array.isArray(rawBindings) || rawBindings.length === 0) continue
    const bindings: TerminalShortcutBinding[] = []
    let valid = true
    for (const rawBinding of rawBindings) {
      const parsed = parseBindingForCommand(id, rawBinding)
      if (!parsed.ok) {
        valid = false
        break
      }
      bindings.push(parsed.binding)
    }
    if (!valid) continue

    const previous = map[id]
    map[id] = bindings
    if (!validateTerminalShortcutMap(map).valid) map[id] = previous
  }
  return map
}

function persistMap(
  storage: StorageLike,
  platform: TerminalShortcutPlatform,
  map: TerminalShortcutMap,
): void {
  const platforms = readPersistedPlatforms(storage)
  platforms[platform] = cloneMap(map)
  storage.setItem(TERMINAL_SHORTCUTS_STORAGE_KEY, JSON.stringify({ version: 1, platforms }))
}

function isCommandId(value: string): value is TerminalShortcutCommandId {
  return TERMINAL_SHORTCUT_DEFINITIONS.some(({ id }) => id === value)
}

/** Persistent, conflict-safe shortcut configuration for the terminal component. */
export class TerminalShortcutSettings {
  private readonly platform: TerminalShortcutPlatform
  private map: TerminalShortcutMap

  public constructor(
    private readonly storage: StorageLike,
    platform: string,
  ) {
    this.platform = normalizeTerminalShortcutPlatform(platform)
    this.map = loadMap(storage, this.platform)
  }

  public getPlatform(): TerminalShortcutPlatform {
    return this.platform
  }

  public getCommands(): TerminalShortcutCommand[] {
    return TERMINAL_SHORTCUT_DEFINITIONS.map((definition) => ({
      ...definition,
      bindings: this.map[definition.id].map(cloneBinding),
    }))
  }

  public getBindings(): TerminalShortcutMap {
    return cloneMap(this.map)
  }

  public resolve(event: TerminalShortcutInput): TerminalShortcutAction | null {
    return mapAction(this.map, event)
  }

  /** Reload a long-lived consumer after another settings surface changes localStorage. */
  public reload(): void {
    this.map = loadMap(this.storage, this.platform)
  }

  public updateBinding(
    commandId: string,
    bindingIndex: number,
    input: unknown,
  ): TerminalShortcutUpdateResult {
    if (!isCommandId(commandId)) {
      return {
        ok: false,
        error: { code: 'unknown-command', message: 'Unknown terminal shortcut command' },
      }
    }
    if (
      !Number.isInteger(bindingIndex) ||
      bindingIndex < 0 ||
      bindingIndex >= this.map[commandId].length
    ) {
      return {
        ok: false,
        error: { code: 'invalid-index', message: 'Invalid terminal shortcut binding index' },
      }
    }
    const parsed = parseBindingForCommand(commandId, input)
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: 'invalid-binding',
          message: parsed.message,
          commandId,
          bindingIndex,
        },
      }
    }

    const candidate = cloneMap(this.map)
    candidate[commandId][bindingIndex] = parsed.binding
    const validation = validateTerminalShortcutMap(candidate)
    if (!validation.valid) {
      const issue = validation.issues.find(
        (entry) => entry.commandId === commandId && entry.bindingIndex === bindingIndex,
      )
      if (issue?.code === 'conflict') {
        return {
          ok: false,
          error: { code: 'conflict', message: issue.message, commandId, bindingIndex },
        }
      }
      return {
        ok: false,
        error: {
          code: 'invalid-binding',
          message: issue?.message ?? 'The terminal shortcut map is invalid',
          commandId,
          bindingIndex,
        },
      }
    }

    this.map = candidate
    persistMap(this.storage, this.platform, this.map)
    return { ok: true, binding: cloneBinding(parsed.binding) }
  }

  public reset(): void {
    this.map = createDefaultTerminalShortcutMap(this.platform)
    const platforms = readPersistedPlatforms(this.storage)
    delete platforms[this.platform]
    if (Object.keys(platforms).length === 0) {
      this.storage.removeItem(TERMINAL_SHORTCUTS_STORAGE_KEY)
    } else {
      this.storage.setItem(
        TERMINAL_SHORTCUTS_STORAGE_KEY,
        JSON.stringify({ version: 1, platforms }),
      )
    }
  }
}

/** Format a binding for a settings field or shortcut hint. */
export function formatTerminalShortcutBinding(
  binding: TerminalShortcutBinding,
  platform: string,
): string {
  const normalizedPlatform = normalizeTerminalShortcutPlatform(platform)
  const modifiers: string[] = []
  if (binding.ctrlKey) modifiers.push('Ctrl')
  if (binding.metaKey) modifiers.push(normalizedPlatform === 'darwin' ? '⌘' : 'Meta')
  if (binding.altKey) modifiers.push(normalizedPlatform === 'darwin' ? '⌥' : 'Alt')
  if (binding.shiftKey) modifiers.push('Shift')
  const key = binding.key === 'Digit' ? '1…9' : binding.key
  return [...modifiers, key].join('+')
}

/** Keep the DOM-to-core adapter tiny and explicit at the renderer seam. */
export function terminalShortcutInputFromKeyboardEvent(
  event: KeyboardEvent,
): TerminalShortcutInput {
  return {
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
  }
}

/** Backwards-compatible default resolver for existing terminal callers. */
export function resolveTerminalShortcut(
  event: TerminalShortcutInput,
  platform: string,
): TerminalShortcutAction | null {
  return resolveConfiguredTerminalShortcut(event, platform)
}
