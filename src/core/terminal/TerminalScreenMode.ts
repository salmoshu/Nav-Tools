// eslint-disable-next-line no-control-regex -- 终端私有模式序列必须匹配 ESC
const PRIVATE_MODE_PATTERN = /\x1b\[(\?[0-9;]*)([hl])/g
// eslint-disable-next-line no-control-regex -- 同上,保留跨帧 ESC 残片
const PARTIAL_PRIVATE_MODE = /\x1b(?:\[[?0-9;]*)?$/
const ALTERNATE_SCREEN_MODES = new Set(['47', '1047', '1049'])

export class TerminalScreenMode {
  private tail = ''
  private alternateScreen = false

  public get isAlternateScreen(): boolean {
    return this.alternateScreen
  }

  public reset(): void {
    this.tail = ''
    this.alternateScreen = false
  }

  public feed(data: string): boolean {
    if (!data) return this.alternateScreen
    const input = this.tail + data
    this.tail = ''
    PRIVATE_MODE_PATTERN.lastIndex = 0
    for (
      let match = PRIVATE_MODE_PATTERN.exec(input);
      match;
      match = PRIVATE_MODE_PATTERN.exec(input)
    ) {
      const modes = match[1].slice(1).split(';')
      if (!modes.some((mode) => ALTERNATE_SCREEN_MODES.has(mode))) continue
      this.alternateScreen = match[2] === 'h'
    }
    const partial = PARTIAL_PRIVATE_MODE.exec(input)
    if (partial) this.tail = partial[0]
    return this.alternateScreen
  }
}
