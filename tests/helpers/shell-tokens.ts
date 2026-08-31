/**
 * 极简 POSIX 分词器，**只用于测试断言**。
 *
 * 按未被引号包裹的分号切命令，再按空白切参数；认识 `'...'\''...'`
 * （闭合 + 转义字面引号 + 重新开引号）这一转义形式。
 *
 * 存在的理由：断言 shell 转义结果时，逐字符比字符串极易手算出错（本项目历史
 * 上就写错过一次期望串）。改成「分词后看结构」才能表达真正关心的安全属性——
 * 恶意文本里的分号**没有**把命令行切成多条命令。
 *
 * 注意：`vitest.config.ts` 的 include 只匹配 `tests/unit` 下的 `*.test.ts`，
 * 本文件不会被当成测试文件收集。
 */
export function splitPosixCommands(line: string): string[][] {
  const commands: string[][] = []
  let words: string[] = []
  let current = ''
  let inSingle = false

  const pushWord = (): void => {
    if (current) words.push(current)
    current = ''
  }
  const pushCommand = (): void => {
    pushWord()
    commands.push(words)
    words = []
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === "'") {
      if (inSingle && line.slice(i + 1, i + 4) === `\\''`) {
        current += "'"
        i += 3
        continue
      }
      inSingle = !inSingle
      continue
    }
    if (!inSingle && char === ';') {
      pushCommand()
      continue
    }
    if (!inSingle && /\s/.test(char)) {
      pushWord()
      continue
    }
    current += char
  }
  pushCommand()
  return commands
}
