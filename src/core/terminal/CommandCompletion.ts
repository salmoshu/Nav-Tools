/**
 * 命令补全的候选计算(纯函数,可单测)。
 *
 * 服务于 GUI 输入行的补全弹层:按光标所在 token 做前缀补全,候选来源三类——
 * 1. 内置命令规格(git/npm/docker 等的子命令与常用选项)
 * 2. 会话内输入历史里同命令、同参数位出现过的 token(越近越优先)
 * 3. 会话当前目录与输入路径下的文件/目录
 *
 * 用前缀匹配而非模糊匹配:shell 补全的惯例就是前缀,且 Ctrl+R 已经提供模糊搜索。
 * 两者混在一个弹层里会让排序难以预测。
 *
 * 许可边界:下面的规格表是**手写的高频命令常识**(命令名与选项是功能性事实,
 * 不受版权保护)。路线图 §3 C4 允许的数据源是 withfig(MIT);若将来要覆盖
 * 长尾命令,应接 withfig 的数据文件,**禁止**使用 Warp 的 command-signatures-v2(AGPL)。
 */

export type CompletionKind = 'command' | 'subcommand' | 'option' | 'history' | 'path'

export interface CompletionCandidate {
  /** 用于替换 [CompletionToken.start, 光标) 区间的文本 */
  text: string
  kind: CompletionKind
  /** 候选说明,展示在补全弹层右侧详情面板;历史/路径类候选没有描述 */
  description?: string
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

export interface CompletionPathEntry {
  name: string
  directory: boolean
}

export interface CompletionPathContext {
  /** 交给会话目录通道解析；`.` 表示当前目录 */
  directory: string
  /** 当前路径最后一段，用于过滤目录条目 */
  prefix: string
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

/** 命令位补全的说明文案(补全弹层详情面板展示);只覆盖高频命令,长尾留空 */
export const SPEC_DESCRIPTIONS: Readonly<Record<string, string>> = {
  git: '版本控制',
  docker: '容器管理',
  npm: 'Node.js 包管理',
  pnpm: '高性能 Node.js 包管理',
  yarn: 'Node.js 包管理',
  ls: '列出目录内容',
  cd: '切换工作目录',
  pwd: '打印当前目录',
  cat: '输出文件内容',
  less: '分页查看文件',
  grep: '按模式搜索文本',
  find: '按条件查找文件',
  rg: '递归搜索文本(ripgrep)',
  echo: '输出文本',
  mkdir: '创建目录',
  rm: '删除文件或目录',
  cp: '复制文件',
  mv: '移动或重命名',
  touch: '创建空文件/更新时间戳',
  chmod: '修改文件权限',
  chown: '修改文件所有者',
  ps: '查看进程',
  kill: '终止进程',
  df: '查看磁盘空间',
  du: '统计目录大小',
  tar: '打包/解包归档',
  unzip: '解压 zip 归档',
  curl: '发起 HTTP 请求',
  wget: '下载文件',
  ssh: '远程登录',
  scp: '远程复制文件',
  make: '执行构建',
  python: '运行 Python',
  node: '运行 Node.js',
  jq: '处理 JSON',
  sed: '流式编辑文本',
  xargs: '把输入拼成命令参数',
  wsl: '管理 WSL 子系统',
  code: '打开 VS Code',
}

/** 子命令说明,键为 `命令 子命令`;只覆盖最常用的组合 */
export const SUBCOMMAND_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'git add': '把变更加入暂存区',
  'git branch': '列出/创建/删除分支',
  'git checkout': '切换分支或恢复文件',
  'git commit': '记录变更到仓库',
  'git diff': '查看变更内容',
  'git fetch': '拉取远端引用',
  'git log': '查看提交历史',
  'git merge': '合并分支',
  'git pull': '拉取并合并远端更新',
  'git push': '推送提交到远端',
  'git rebase': '把提交变基到另一分支',
  'git reset': '重置当前分支状态',
  'git restore': '恢复工作区文件',
  'git show': '查看某次提交的详情',
  'git stash': '暂存未提交的变更',
  'git status': '查看工作区状态',
  'git switch': '切换分支',
  'git tag': '管理标签',
  'docker build': '从 Dockerfile 构建镜像',
  'docker compose': '编排多容器应用',
  'docker exec': '在运行中的容器里执行命令',
  'docker images': '列出本地镜像',
  'docker ps': '列出容器',
  'docker pull': '拉取镜像',
  'docker push': '推送镜像',
  'docker run': '创建并运行容器',
  'docker stop': '停止容器',
  'npm install': '安装依赖',
  'npm run': '运行 package.json 脚本',
  'npm test': '运行测试',
  'npm uninstall': '卸载依赖',
  'pnpm install': '安装依赖',
  'pnpm run': '运行 package.json 脚本',
}

/** 取候选说明:子命令按 `命令 子命令` 查,其次按命令名查 */
function descriptionFor(commandName: string, token: string): string | undefined {
  if (!commandName) return SPEC_DESCRIPTIONS[token]
  return SUBCOMMAND_DESCRIPTIONS[`${commandName} ${token}`] ?? SPEC_DESCRIPTIONS[token]
}

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

/** 参数位的路径查询上下文；命令位、选项与带引号 token 交给 shell 自己处理。 */
export function completionPathContext(
  input: string,
  cursor: number,
): CompletionPathContext | undefined {
  const token = completionToken(input, cursor)
  if (
    !input.slice(0, token.start).trim() ||
    token.text.startsWith('-') ||
    /^["']/.test(token.text)
  ) {
    return undefined
  }
  const separator = Math.max(token.text.lastIndexOf('/'), token.text.lastIndexOf('\\'))
  return {
    directory: separator < 0 ? '.' : token.text.slice(0, separator + 1),
    prefix: token.text.slice(separator + 1),
  }
}

/**
 * 计算补全候选。
 *
 * @param input 输入行全文
 * @param cursor 光标位置(用于定位 token)
 * @param history 会话内输入历史,越靠后越新
 * @param specs 命令规格;默认用内置规格表
 * @param limit 最多返回条数
 * @param paths 当前待补全目录中的条目
 */
export function completeCommandLine(
  input: string,
  cursor: number,
  history: readonly string[],
  specs: readonly CommandSpec[] = BUILTIN_SPECS,
  limit = 20,
  paths: readonly CompletionPathEntry[] = [],
): CompletionCandidate[] {
  const token = completionToken(input, cursor)
  const prefix = token.text
  const head = input.slice(0, token.start).trim()
  const headTokens = head.length > 0 ? head.split(/\s+/) : []

  const results: CompletionCandidate[] = []
  const seen = new Set<string>()
  const push = (text: string, kind: CompletionKind, description?: string): void => {
    if (seen.has(text)) return
    seen.add(text)
    results.push({ text, kind, description })
  }
  const pushPaths = (): void => {
    const context = completionPathContext(input, cursor)
    if (!context) return
    const base = context.directory === '.' ? '' : context.directory
    const separator = context.directory.endsWith('\\') ? '\\' : '/'
    for (const entry of paths) {
      // ponytail: quoting is shell-specific; add whitespace paths when the GUI knows the shell family.
      if (/\s/.test(entry.name) || !entry.name.startsWith(context.prefix)) continue
      push(`${base}${entry.name}${entry.directory ? separator : ''}`, 'path')
    }
  }

  // 命令位:内置规格的命令名在前,历史里用过的命令名补在后(最近优先)
  if (headTokens.length === 0) {
    for (const spec of specs) {
      if (spec.name.startsWith(prefix)) {
        push(spec.name, 'command', SPEC_DESCRIPTIONS[spec.name])
      }
    }
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const first = history[index].trim().split(/\s+/)[0]
      if (first && first.startsWith(prefix)) push(first, 'history', SPEC_DESCRIPTIONS[first])
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
        if (subcommand.startsWith(prefix)) {
          push(subcommand, 'subcommand', descriptionFor(commandName, subcommand))
        }
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

  pushPaths()

  return results.slice(0, limit)
}

/** Warp 风格行内提示：最近的完整历史命令优先，没有时取当前最高优先级补全。 */
export function suggestCommandLine(
  input: string,
  history: readonly string[],
  specs: readonly CommandSpec[] = BUILTIN_SPECS,
  paths: readonly CompletionPathEntry[] = [],
): string | undefined {
  if (!input.trim()) return undefined
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const command = history[index]
    if (command !== input && command.startsWith(input)) return command
  }
  const candidate = completeCommandLine(input, input.length, history, specs, 1, paths)[0]
  if (!candidate) return undefined
  const { start } = completionToken(input, input.length)
  const suggestion = input.slice(0, start) + candidate.text
  return suggestion === input ? undefined : suggestion
}
