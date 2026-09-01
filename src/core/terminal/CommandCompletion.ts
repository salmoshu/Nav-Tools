/**
 * 命令补全的候选计算(纯函数,可单测)。
 *
 * 服务于 GUI 输入行的补全弹层:按光标所在 token 做前缀补全,候选来源两类——
 * 1. 内置命令规格(git/npm/docker 等的子命令与常用选项)
 * 2. 会话内输入历史里同命令、同参数位出现过的 token(越近越优先)
 *
 * 用前缀匹配而非模糊匹配:shell 补全的惯例就是前缀,且 Ctrl+R 已经提供模糊搜索。
 * 两者混在一个弹层里会让排序难以预测。
 *
 * 许可边界:下面的规格表是**手写的高频命令常识**(命令名与选项是功能性事实,
 * 不受版权保护)。路线图 §3 C4 允许的数据源是 withfig(MIT);若将来要覆盖
 * 长尾命令,应接 withfig 的数据文件,**禁止**使用 Warp 的 command-signatures-v2(AGPL)。
 */

export type CompletionKind = 'command' | 'subcommand' | 'option' | 'history'

export interface CompletionCandidate {
  /** 用于替换 [CompletionToken.start, 光标) 区间的文本 */
  text: string
  kind: CompletionKind
}

export interface CommandSpec {
  name: string
  subcommands?: string[]
  options?: string[]
}

/** 待补全 token 的区间 [start, cursor);start 为 token 首字符下标 */
export interface CompletionToken {
  start: number
  text: string
}

/** 手写的高频命令规格;顺序即补全弹层的展示顺序 */
export const BUILTIN_SPECS: readonly CommandSpec[] = [
  {
    name: 'git',
    subcommands: [
      'add',
      'branch',
      'checkout',
      'cherry-pick',
      'clone',
      'commit',
      'diff',
      'fetch',
      'log',
      'merge',
      'pull',
      'push',
      'rebase',
      'reset',
      'restore',
      'show',
      'stash',
      'status',
      'switch',
      'tag',
    ],
    options: [
      '--amend',
      '--all',
      '--force',
      '--oneline',
      '--rebase',
      '--set-upstream',
      '--verbose',
      '-a',
      '-b',
      '-m',
      '-v',
    ],
  },
  {
    name: 'npm',
    subcommands: [
      'audit',
      'build',
      'ci',
      'init',
      'install',
      'ls',
      'outdated',
      'publish',
      'run',
      'start',
      'test',
      'uninstall',
      'update',
    ],
    options: [
      '--force',
      '--global',
      '--legacy-peer-deps',
      '--production',
      '--save-dev',
      '-D',
      '-g',
    ],
  },
  {
    name: 'pnpm',
    subcommands: [
      'add',
      'build',
      'dlx',
      'exec',
      'install',
      'list',
      'outdated',
      'remove',
      'run',
      'start',
      'store',
      'test',
      'update',
    ],
    options: ['--filter', '--global', '--recursive', '--save-dev', '-D', '-g', '-r', '-w'],
  },
  {
    name: 'yarn',
    subcommands: ['add', 'build', 'dlx', 'install', 'remove', 'run', 'start', 'test', 'upgrade'],
    options: ['--dev', '--global', '-D'],
  },
  {
    name: 'docker',
    subcommands: [
      'build',
      'compose',
      'container',
      'cp',
      'exec',
      'images',
      'logs',
      'ps',
      'pull',
      'push',
      'rm',
      'rmi',
      'run',
      'stop',
      'volume',
    ],
    options: [
      '--all',
      '--detach',
      '--interactive',
      '--rm',
      '--tty',
      '--volume',
      '-d',
      '-it',
      '-p',
      '-v',
    ],
  },
  {
    name: 'systemctl',
    subcommands: [
      'daemon-reload',
      'disable',
      'enable',
      'list-units',
      'reload',
      'restart',
      'start',
      'status',
      'stop',
    ],
    options: ['--failed', '--now', '--user'],
  },
  {
    name: 'ls',
    options: [
      '--all',
      '--color',
      '--human-readable',
      '--long',
      '--recursive',
      '-a',
      '-h',
      '-l',
      '-R',
    ],
  },
  { name: 'cat', options: ['--number', '--show-ends', '-A', '-n'] },
  {
    name: 'cp',
    options: ['--force', '--interactive', '--recursive', '--verbose', '-f', '-i', '-r', '-v'],
  },
  { name: 'mv', options: ['--force', '--interactive', '--verbose', '-f', '-i', '-v'] },
  {
    name: 'rm',
    options: ['--force', '--interactive', '--recursive', '--verbose', '-f', '-i', '-r', '-v'],
  },
  { name: 'mkdir', options: ['--parents', '--verbose', '-p', '-v'] },
  {
    name: 'grep',
    options: [
      '--color',
      '--extended-regexp',
      '--ignore-case',
      '--invert-match',
      '--line-number',
      '--recursive',
      '-E',
      '-i',
      '-n',
      '-r',
      '-v',
    ],
  },
  { name: 'find', options: ['-exec', '-maxdepth', '-name', '-not', '-type'] },
  {
    name: 'curl',
    options: [
      '--data',
      '--fail',
      '--header',
      '--location',
      '--output',
      '--request',
      '--silent',
      '-H',
      '-L',
      '-X',
      '-d',
      '-o',
      '-s',
    ],
  },
  { name: 'ssh', options: ['-L', '-N', '-R', '-i', '-o', '-p', '-v'] },
  { name: 'scp', options: ['-P', '-i', '-r', '-v'] },
  {
    name: 'tar',
    options: [
      '--create',
      '--extract',
      '--file',
      '--gzip',
      '--list',
      '--verbose',
      '-c',
      '-f',
      '-t',
      '-v',
      '-x',
      '-z',
    ],
  },
  { name: 'unzip', options: ['-d', '-l', '-o', '-q'] },
  { name: 'make', options: ['--always-make', '--dry-run', '--jobs', '-B', '-j', '-n'] },
  { name: 'python', options: ['--help', '--module', '--version', '-V', '-c', '-m'] },
  { name: 'node', options: ['--eval', '--require', '--version', '-e', '-r', '-v'] },
  { name: 'chmod', options: ['--recursive', '--verbose', '-R', '-v', '+x'] },
  { name: 'chown', options: ['--recursive', '-R'] },
  { name: 'ps', options: ['--forest', '-e', '-f'] },
  { name: 'kill', options: ['-15', '-9', '-KILL', '-TERM'] },
  { name: 'df', options: ['--human-readable', '-T', '-h'] },
  { name: 'du', options: ['--human-readable', '--max-depth', '--summarize', '-d', '-h', '-s'] },
  { name: 'sed', options: ['--expression', '--in-place', '-e', '-i', '-n'] },
  { name: 'jq', options: ['--raw-output', '--slurp', '-c', '-r', '-s'] },
  { name: 'xargs', options: ['-0', '-I', '-n', '-p'] },
  {
    name: 'wsl',
    subcommands: ['--install', '--list', '--set-version', '--shutdown', '--terminate', '--update'],
    options: ['--list', '--shutdown', '-d', '-l', '-v'],
  },
  {
    name: 'code',
    options: ['--diff', '--goto', '--new-window', '--reuse-window', '-g', '-n', '-r'],
  },
]

/**
 * 取光标所在 token。光标可能超出输入长度(理论上),先夹到合法范围。
 * 只按空白切分,不做引号解析——引号内的 token 带引号参与前缀匹配,自然匹配不到
 * 任何候选,于是不会在引号里弹出无意义的补全。
 */
export function completionToken(input: string, cursor: number): CompletionToken {
  const end = Math.max(0, Math.min(cursor, input.length))
  let start = end
  while (start > 0 && !/\s/.test(input[start - 1])) start -= 1
  return { start, text: input.slice(start, end) }
}

/**
 * 计算补全候选。
 *
 * @param input 输入行全文
 * @param cursor 光标位置(用于定位 token)
 * @param history 会话内输入历史,越靠后越新
 * @param specs 命令规格;默认用内置规格表
 * @param limit 最多返回条数
 */
export function completeCommandLine(
  input: string,
  cursor: number,
  history: readonly string[],
  specs: readonly CommandSpec[] = BUILTIN_SPECS,
  limit = 20,
): CompletionCandidate[] {
  const token = completionToken(input, cursor)
  const prefix = token.text
  const head = input.slice(0, token.start).trim()
  const headTokens = head.length > 0 ? head.split(/\s+/) : []

  const results: CompletionCandidate[] = []
  const seen = new Set<string>()
  const push = (text: string, kind: CompletionKind): void => {
    if (seen.has(text)) return
    seen.add(text)
    results.push({ text, kind })
  }

  // 命令位:内置规格的命令名在前,历史里用过的命令名补在后(最近优先)
  if (headTokens.length === 0) {
    for (const spec of specs) {
      if (spec.name.startsWith(prefix)) push(spec.name, 'command')
    }
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const first = history[index].trim().split(/\s+/)[0]
      if (first && first.startsWith(prefix)) push(first, 'history')
    }
    return results.slice(0, limit)
  }

  const commandName = headTokens[0]
  const spec = specs.find((item) => item.name === commandName)
  /** 正在补全的是第几个参数(0 起) */
  const argumentIndex = headTokens.length - 1

  if (spec) {
    // 以 - 开头只补选项;第一个参数位补子命令;更靠后的参数位没有规格可依
    if (prefix.startsWith('-')) {
      for (const option of spec.options ?? []) {
        if (option.startsWith(prefix)) push(option, 'option')
      }
    } else if (argumentIndex === 0) {
      for (const subcommand of spec.subcommands ?? []) {
        if (subcommand.startsWith(prefix)) push(subcommand, 'subcommand')
      }
    }
  }

  // 历史里同命令、同参数位出现过的 token(最近优先)
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const tokens = history[index].trim().split(/\s+/)
    if (tokens[0] !== commandName) continue
    const candidate = tokens[argumentIndex + 1]
    if (candidate && candidate.startsWith(prefix)) push(candidate, 'history')
  }

  return results.slice(0, limit)
}
