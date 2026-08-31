# 命令感知渲染设计：ls → 文件树，cat → Markdown

> 用户原话：「例如我执行了 ls，下面会呈现一个文件树，我可以折叠和展开文件夹，
> 查看文件夹和文件。例如我 cat 一个 markdown 内容，我也能看到 markdown 格式的文件。」
> 状态：**设计分析，未实现**。相关背景见 `03-implementation.md`（v1.5.0 已实现部分）、
> `research/wave-notes.md`、`research/cmux-notes.md`、`research/survey-notes.md`。
>
> ⚠️ **「所有命令都做 DOM 呈现」的可行性边界与优先级修正见 `01-requirements.md` §4**：
> 全命令覆盖**不可行**（交互式程序原理上无 DOM 形态 + 长尾无界）；
> 可行的是「L1 嗅探覆盖长尾 + L2 白名单保证头部 + L3 可配置扩展」。
> 因此本文 §8 的实施顺序已按该结论调整：**嗅探先于包装**。

## 0. 这其实是「命令感知渲染」，不是「文本美化」

已实现的 GUI 块视图是**文本块的排版优化**（把 ANSI 字节流归一化成纯文本再等宽显示）。
用户要的是**换渲染器**：同一个块，输出不再是等宽文本，而是一个 Vue 组件（文件树、
Markdown 渲染器、表格）。

差别是本质性的：

| | 文本块（现状） | 命令感知渲染（目标） |
|---|---|---|
| 数据来源 | PTY 字节流 | **结构化数据**（JSON / MIME 载荷） |
| 渲染器 | `<pre>` 等宽文本 | 文件树 / Markdown / 表格 / 图片…… |
| 交互 | 折叠、复制、重跑 | 展开目录、点击文件、排序、搜索 |
| 失败模式 | 归一化不完美（进度条、折行） | 拿不到结构化数据 → **降级为文本** |

与现有 OSC 1338 的关系：现在是**程序主动上报**（用户要显式敲 `nav-render`），
用户要的是**标准命令自动富化**——`ls`、`cat` 这些原装命令直接生效。

可类推的命令矩阵（按性价比排序）：

| 命令 | 渲染器 | 结构化难度 |
|---|---|---|
| `ls` / `dir` | 可折叠文件树 | 中（需文件系统语义） |
| `cat *.md` / `*.json` / `*.csv` / 图片 | 复用现有富内容渲染器 | 低（扩展名映射即可） |
| `git log` | 提交列表（hash/作者/日期/标题，可点击展开 diff） | 低（`--pretty` 可出 JSON） |
| `git status` | 分组列表（staged/unstaged/untracked） | 低（`--porcelain`） |
| `ps` / `docker ps` / `df` / `free` | 表格 / 条形图 | 中 |
| `hexdump` / `xxd` | hex viewer | 低 |
| `tree` / `find` | 文件树 / 列表 | 中 |
| `diff` | 并排 diff | 中 |

**建议先做 `ls` 与 `cat` 两个**，验证通道后再批量加。

---

## 1. 结构化数据从哪来：三条路与取舍

| 路线 | 做法 | 优点 | 致命问题 |
|---|---|---|---|
| **A. 包装标准命令** | 注入 shell 函数 `ls()` / `cat()`，执行真实命令的同时把结构化数据经 OSC 1338 上报 | 数据准确（真文件系统语义）；`ls` 能区分文件/目录/链接 | 侵入用户 shell；要处理管道、重定向、脚本、`sudo`、别名 |
| **B. 解析文本输出** | 渲染器解析 `ls` 的等宽文本 | 不改 shell | 极脆弱：GNU/BSD/busybox `ls` 格式不同、`--color` 掺控制字符、`-l` 与裸 `ls` 布局不同、文件名含空格/换行 |
| **C. 嗅探输出内容** | 不管命令是什么，看输出像什么（Markdown/JSON/CSV/表格） | 零侵入，对 SSH 会话也有效 | 拿不到文件系统语义——**单靠嗅探无法区分 `ls` 里的文件与目录**（除非用了 `--color` 或 `-F`） |

**结论：A 为主 + C 为兜底，B 不要做。**

- 需要文件系统语义的（`ls`、`tree`、`du`）走 A。
- 高置信度的内容类型（Markdown、JSON、CSV、diff）走 C，不动 shell。
- 两者都拿不到时，降级为今天的文本块。

---

## 2. 硬约束：来自现有注入已验证的三条不变量

`electron/main/services/TerminalService.ts:40-71` 的注释里记着三条踩过坑的经验，
**新增的包装器必须全部满足**，否则会重现已修过的 bug：

1. **载荷必须写到启动时保存的终端 fd（`>&$__nav133_fd`），不能写 stdout。**
   否则 `ls > out.txt` 会把 OSC 序列吞进用户文件，同时终端收不到 → 文件被控制字节污染。
2. **只在交互态、stdout 是 TTY 时上报**：守卫 `[ -t 1 ]`。
   这样 `ls | grep x`、`$(ls)`、`ls > f` 全部自动跳过——既避免语义错误
   （输出根本没进终端却冒出一个块），也顺带规避了重定向吞标记的问题。
3. **函数名要能被现有 DEBUG 过滤器放行。** 现有过滤器是
   `case "$BASH_COMMAND" in __nav133*|*__nav_e*|"trap "*) ;;`，
   所以内部命令统一用 `__nav133_` 前缀命名（如 `__nav133_ls_probe`），
   就不会触发 C 标记、不会产生「printf 幻影块」。
4. **不能改变真实命令的退出码与输出**：包装器最后一条语句就是
   `command ls "$@"`，结构化上报的失败必须静默（不能影响 `$?`、不能往 stderr 打东西）。

> PowerShell 侧（`TerminalService.ts:78+`）目前只有 `nav-render` 一个函数，
> 没有 DEBUG trap 等价物。若要支持 `dir` / `Get-Content`，需要另一套包装
> （PowerShell 可用 `Set-Alias`/函数 + `$MyInvocation`），**建议 PowerShell 侧只做
> `cat`/`Get-Content` 的内容富化，文件树先只做 bash/WSL**。

> 维护性提醒：`OSC133_BASH_INTEGRATION` 已经是一个用 `; ` 拼起来的长字符串，
> 再加几个包装函数会迅速不可读。Wave 的做法是启动时用 `--rcfile` 注入脚本文件
> （对应其 `wave.fish` / `wavepwsh.ps1`）。**建议在加第二组函数前，先把注入改成
> 「生成临时 rc 文件 + `--rcfile`/`BASH_ENV` 注入」，否则这段字符串会变成没人敢碰的禁区。**

---

## 3. `ls` → 可折叠文件树

### 3.1 载荷

新增一个内部 MIME：`application/x-nav-filelist`（复用 OSC 1338 通道，
需加进 `CommandBlocks.ts` 的 `SUPPORTED_RICH_MIMES`）。

```json
{
  "v": 1,
  "cwd": "/home/winchell/E-Wagon",
  "cmd": "ls -la",
  "truncated": false,
  "entries": [
    { "name": "src", "type": "dir",  "size": 4096, "mtime": 1788058723, "mode": "drwxr-xr-x" },
    { "name": "README.md", "type": "file", "size": 1234, "mode": "-rw-r--r--" },
    { "name": "link-to-src", "type": "link", "target": "src" }
  ]
}
```

字段不必一次做全：**第一版只要 `name` + `type` + `size`**，`mtime`/`mode` 可后补
（它们要额外 `stat`，是性能大头，可以展开时才取）。

### 3.2 一级 listing + 懒加载（不要一次递归）

不要用 `ls -R` 或 `find` 递归整棵树——大目录会卡死，且用户根本不看。
正确做法是**只上报一层，展开时按需回查**：

```text
用户展开 "src"  →  渲染器发 terminal-session-write: __nav133_ls_probe 'src' >/dev/null 2>&1
                →  该命令写出 OSC 1338 载荷 {parent: "src", entries: [...]}
                →  渲染器按 parent 路径回填到树节点
```

要点：

- 帮助命令必须以 `__nav133_` 开头（约束 3），不产生幻影块；
  并且自己把 stdout 重定向掉，避免在终端里闪一行输出。
- 载荷要带一个**关联键**（`parent` 路径，或显式 request id，类似 cmux 的
  `correlationKey`），否则并发展开会串位。
- 展开失败/超时要有退路：节点显示重试按钮，不要静默空。

### 3.3 降级规则（重要）

包装器**不是所有 `ls` 都拦截**。规则：解析参数，遇到不认识的标志/选项就
**直接跳过上报，原样执行真实 `ls`**。第一版只处理：

- 裸 `ls`
- `ls <dir>` / `ls <dir> <dir2>`
- `ls -a` / `-l` / `-la` / `-al` / `-h` / `-1`（及其组合）
- 遇到 `-R`、`--block-size`、`--format`、`-t`、`-r`、`-S` 等一律跳过

这样「我们不理解的场景」自动退回今天的文本块，**永远不会比现状更差**。

### 3.4 上限与性能

- 条目上限（建议 1000）：超出则 `truncated: true` 并只上报前 N 条，
  文件树顶部显示截断提示。
- 优先用 bash 内建判定（`[[ -d ]]` / `[[ -f ]]` / `[[ -L ]]`），
  避免每个条目 fork 一次；`size` 用一次批量 `stat` 而不是逐条 `stat`。
- 隐藏文件：跟随 `-a`；不显示 `.` / `..`（由渲染器统一处理，别塞进载荷）。

### 3.5 交互

- 点击目录 = 展开/折叠（懒加载）；点击文件 = 在块内预览
  （复用 `TerminalRichContent.vue` 的 MIME 渲染器，扩展名映射同 `nav-render`），
  或提供「在新窗格打开 / 用默认程序打开」。
- 排序、搜索过滤、显示隐藏文件：放在块头，纯前端，不需要回会话。

---

## 4. `cat` → Markdown

这条比 `ls` 简单得多，因为**不需要文件系统语义**，扩展名映射已经存在
（`TerminalService.ts:66` 的 `nav-render` 与 `:81-85` 的 PowerShell 版本）。

做法：`cat()` 包装器复用同一张扩展名 → MIME 映射表，命中白名单就上报，
未命中就原样执行真实 `cat`。

必须处理的边界：

- **多参数**：`cat a.md b.md` → 上报两个载荷（顺序即参数顺序），
  或合并为一个；建议分别上报，渲染成一前一后两个富内容区。
- **大文件**：超过 `MAX_RICH_PAYLOAD_CHARS` 直接放弃上报（现有机制已会丢弃），
  但包装器最好自己先判断大小并跳过，避免白做一次 base64。
- **二进制**：扩展名不在白名单 → 不上报（现状行为）。
- **stdin 形态**：`cat` 无参数（读 stdin）、`cat < f`、`echo x | cat` →
  `[ -t 1 ]` 之外的守卫也要加：有参数且参数是存在的文件才上报。
- **相关命令**：`less` / `head` / `tail` / `bat` 是否也要富化？
  建议第一版只做 `cat`，`less` 是分页器（交互式，且走 alternate screen），
  富化它会引入新的复杂度。

---

## 5. 嗅探兜底（不动 shell 也能富化的部分）

对**所有**块（包括 SSH 会话这种没有注入的）在渲染侧做内容嗅探，按置信度分级：

| 置信度 | 特征 | 处理 |
|---|---|---|
| 高 | 以 ``` 代码围栏 / `# ` 标题 / `- ` 列表 / `[x](y)` 链接为主 | 默认渲染为 Markdown |
| 高 | 整体能被 `JSON.parse` | JSON 树（已有渲染器） |
| 高 | 首行是表头且分隔符一致（`,` 或 `\t`） | CSV/表格（已有渲染器） |
| 中 | 以 `diff --git` / `--- a/` `+++ b/` 开头 | diff 视图 |
| 低 | 每行都是单个 token、无空格（像 `ls` 输出） | **不要自作主张渲染成树**——无法区分文件与目录；只在用户手动点「按文件树查看」时尝试，且要显式标注为猜测 |

嗅探结果一律可撤销：**块头提供「渲染 / 原始」切换**。

---

## 6. 必备的开关

1. **每块「渲染 / 原始」切换**：任何富化都必须能一键看回原始输出。
   这既是可用性要求（有人就是要看裸文本），也是降级通道（渲染器出错时不至于看不到输出）。
2. **全局 + per-pane 开关**：命令感知渲染默认**先关**，
   自己 dogfood 一段时间再默认开。理由见 §7。
3. **每个命令可单独关**（至少 `ls` 与 `cat` 分开）。

---

## 7. 风险清单

### 7.1 覆盖内建命令的固有风险

- **脚本**：`PROMPT_COMMAND` 只在交互式 bash 执行，包装器不会进入脚本——这条是安全的。
- **管道 / 重定向**：`[ -t 1 ]` 守卫覆盖。
- **`sudo ls`、`env ls`、`command ls`、`\ls`**：绕过函数，退回文本块。可接受，
  但要在文档里说明「这些形态不会富化」，否则用户会当成 bug。
- **用户别名**：如果用户自己也定义了 `ls` 别名/函数，可能互相覆盖。
  我们的函数在 `PROMPT_COMMAND` 里每次提示符都重新定义，会覆盖用户的函数定义
  （但覆盖不了别名；别名展开后仍会调到我们的函数）。需要在真实环境验证。
- **性能**：每个 `ls` 多一次列表构建。大目录必须靠上限兜住。

### 7.2 跨会话形态差异

| 会话类型 | 注入 | 结论 |
|---|---|---|
| 本地 Git Bash | 有（`PROMPT_COMMAND`） | 可做 `ls` + `cat` |
| WSL（bash） | 有 | 可做 |
| 本地 PowerShell | 仅有 `nav-render` | 建议只做 `cat`/`Get-Content` 内容富化 |
| **SSH 远程会话** | **无注入**（现有实现明确不注入远端） | **只能靠嗅探**；文件树不可用 |

→ **SSH 会话必须优雅降级**，且在 UI 上让用户知道「此会话不支持命令感知渲染」。
（长期若真需要远端结构化数据，才值得考虑 Wave `wsh` 那种 companion binary 投递方案，
见 `research/wave-notes.md` §3。）

### 7.3 安全

- MIME 白名单（`SUPPORTED_RICH_MIMES`）与大小上限（`MAX_RICH_PAYLOAD_CHARS`）
  继续生效——**新增的 `application/x-nav-filelist` 也要纳入同一套上限**。
- **Markdown 渲染的不变量必须保持**：`TerminalRichContent.vue:4` 注明
  `MarkdownLite` 先全文转义再变换，所以 `v-html` 是安全的。
  以后若引入「支持内嵌 HTML」或 mermaid，这条不变式就破了，必须同时引入 DOMPurify 之类。
- 文件名可能包含换行符 / 控制字符 / RTL 覆写字符：载荷里的 `name` 走 JSON 转义，
  但**渲染时仍要当不可信字符串处理**（不能拼进 HTML，不能当路径直接拼命令）。

---

## 8. 与「块内容从 xterm buffer 派生」的关系

这是本次分析最重要的一个判断：

> **命令感知渲染会显著降低（但不消除）对 `normalizeTerminalLayout` 的依赖。**

理由：用户抱怨的那些 bug（进度条首尾粘连、折行、列对齐）集中在**文本块**。
一旦高频命令（`ls`、`cat *.md`、`git log`、`ps`）有了结构化渲染器，
它们就不再走文本归一化路径，那些 bug 对它们**直接消失**。

但**不能因此不做那次重构**：

- 未知命令、`sudo ls`、`ls | grep`、SSH 会话——仍然大量落到文本块；
- 富化是渐进的，不可能一次覆盖所有命令；
- 文本块的质量下限决定了「没富化的时候有多难看」。

**建议顺序**（对应 `01-requirements.md` §4.4 的四层模型）：

| 步 | 内容 | 层 | 理由 |
|---|---|---|---|
| 1 | 「渲染 / 原始」切换 + 内容嗅探 | **L1** | 不改 shell、零风险、覆盖面最大（长尾、SSH 会话都受益），立刻见效 |
| 2 | `cat` 富化 | L2 | 复用现有 `nav-render` 扩展名映射，风险最低 |
| 3 | `ls` 文件树 | L2 | 需要新 MIME + 懒加载通道 + 关联键 |
| 4 | xterm buffer 派生重构 | L0 加固 | 一次架构改动，放最后；此时「哪些命令还依赖文本块」已清楚 |
| 5 | 渲染器配置化（命令匹配 + 取数命令 + 模板） | **L3** | 长尾唯一可持续的覆盖方式，见 `01-requirements.md` §4.7 |

关键顺序判断：**L1 嗅探先于 L2 包装**。虽然包装能保证头部质量（嗅探分不出
`ls` 里的文件与目录），但要「尽量多的命令有 DOM 呈现」，嗅探是唯一能覆盖
长尾和 SSH 会话的手段，且成本最低、零侵入。详见 `01-requirements.md` §4.6。

---

## 9. 待确认的问题（需要用户拍板）

1. **是否接受覆盖 `ls` / `cat` 内建命令？** 这是 §1 路线 A 的前提。
   若不接受，替代方案是只提供 `nav-ls` / `nav-cat` 显式命令 + 嗅探，
   但「直接敲 ls 就出文件树」做不到。
2. **默认开还是默认关？** 我建议先关（§6）。
3. **文件节点的点击行为**：块内预览 / 新窗格打开 / 系统默认程序打开？
4. **`ls` 富化的适用范围**：只本地 bash+WSL，还是 PowerShell 的 `dir` 也要？

---

## 10. 引用索引

现有实现（本次分析的所有约束均来自这里）：

- `electron/main/services/TerminalService.ts:40-71` bash 注入与三条不变量
- `electron/main/services/TerminalService.ts:66` `nav-render`（bash，扩展名映射）
- `electron/main/services/TerminalService.ts:78-88` PowerShell 注入
- `src/core/terminal/CommandBlocks.ts:40-48` `SUPPORTED_RICH_MIMES` 与三个上限
- `src/core/terminal/CommandBlocks.ts:374-397` OSC 1338 归属当前块的逻辑
- `src/components/windows/common/TerminalRichContent.vue:4-6` Markdown 安全不变式
- `src/components/windows/common/TerminalGuiView.vue:79-86` 块内富内容 + 文本输出
- `src/components/windows/common/TerminalGuiView.vue:170-172` 文本归一化调用点

外部参考：

- Wave：`pkg/wconfig/defaultconfig/widgets.json`（零命令入口）、
  `frontend/app/view/preview/preview-directory.tsx:373-423`（目录 GUI 操作）
- cmux：`docs/custom-sidebars.md`（用户可声明式扩展的面板）、
  `Sources/TerminalNotification.swift`（`correlationKey` 式关联键设计）
- Zellij 0.44：`zellij subscribe` / `list-panes` / `dump-screen`（读回看 + 高亮 + 点击回调）
