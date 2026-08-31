# CodeBuddy 工作交接：终端命令感知渲染（批次 1–4 + xterm buffer 轨道）

> 本文档由 AI 在会话中断点整理，反映 **工作区实际状态**（已用 `git status` / `git log` / 只读文件检查核对）。
> 状态时间锚点：本地分支 `main`，HEAD = `490ef22d1`（批次 1 第 4 个提交）。
> 所有批次 1 工作已本地提交但**尚未 push**，也**尚未在应用内人工验证**（用户要求最后统一验证）。

---

## 1. 用户目标与关键决策

- **终极目标**：把终端做成「命令感知」体验（对齐 Warp 的可选灵感），核心诉求是用户举例的原话：
  > “例如我执行了 `ls`，下面会呈现一个文件树……我 `cat` 一个 markdown 内容，也能看到 markdown 格式的文件。”
- **策略来源**：只抄 Warp 的**策略**，绝不复制/改写其 AGPL 代码（见 §7 许可边界）。
- **实施顺序决策**（来自 `doc/terminal-component/05-roadmap.md` 与 `04-design.md §8`）：
  - **L1 嗅探先于 L2 包装**。先用零侵入的内容嗅探覆盖长尾 + SSH 会话，再考虑 shell 函数包装 `ls`/`cat`。
  - 批次 1（B1–B4）已按此完成；批次 2 起进入 C 类（文件树、预设命令等）。
- **默认开关**：命令感知渲染（若后续做 L2 包装）应先默认关，dogfood 后再默认开。
- **验证节奏**：用户明确要求**所有批次先一起做完，最后统一验证**，中途不跑应用验证。
- **提交纪律**（历史约定）：阶段工作只做**本地 commit**，push / PR 前必须询问用户。

---

## 2. 已完成工作（逐文件）

批次 1 = 4 个本地提交，覆盖 B1 路径预览、B4 内容嗅探、B3 历史搜索、B2 搜索。

### B1 路径点击预览（commit `87b357c37`）
- `src/core/terminal/FileMime.ts`（新增）：文件名 → MIME 映射；`fileExtension` / `mimeFromPath` / `isPathExtension`（扩展名白名单，压掉 `1.5.0` 这类版本号误判）。
- `src/core/terminal/PathDetection.ts`（新增）：从终端输出检测路径候选的纯函数。`detectPaths` 按两级策略（含分隔符 或 在扩展名白名单内），剥离行号列号后缀（`:line:col`）与结尾标点，排除 URL / shell `$` 变量；`splitOutputByPaths` 切成可渲染片段。20 个单测。
- `src/core/terminal/TerminalTypes.ts`：新增 `TerminalPathStat` / `TerminalPathRead` 类型。
- `electron/main/services/TerminalService.ts`：新增 `statSessionPath` / `readSessionPath`，按会话类型走三通道——本机 `fs`、WSL `wsl.exe`（`head -c` 截断）、SSH `sftp`（流式读，上限 512KB）。复用 B1 时写的 `resolveSessionPath`（按会话运行时 cwd 解析相对路径，本机 Windows / WSL-SSH POSIX 语义）。
- `electron/main/terminalIpc.ts`：新增 `terminal-path-stat` / `terminal-path-read` 两个 IPC handler。
- `src/components/windows/common/TerminalGuiView.vue`：输出改为**分段渲染**，候选路径悬停异步确认存在性、确认后变可点击链接，点击在块内展开文件预览（复用 `TerminalRichContent` 渲染器，支持 Markdown/JSON/CSV/图片），未确认/不可读均有兜底。预览状态 `PreviewState` 管理。
- `src/components/windows/common/TerminalPane.vue`：把 `sessionInfo?.id` 传入 GUI 视图，跨会话路径缓存隔离。
- `src/i18n/locales/{zh-CN,en-US}/common.ts`：新增路径预览相关键。

### B4 内容嗅探 + 渲染/原始切换（commit `1a931d1d3`）
- `src/core/terminal/ContentSniff.ts`（新增）：只认高置信度特征——整体可 `JSON.parse` 的对象/数组、列数一致且 ≥3 行的 CSV/TSV、信号行过半且 ≥2 类特征或出现代码围栏的 Markdown。标量 JSON / 单 token 行（ls 风格）/ 普通文本一律不富化。15 个单测。
- `src/core/terminal/CommandBlocks.ts`：新增 `encodeTextBase64`（与已有 `decodeBase64Text` 对称）。
- `TerminalGuiView.vue`：对无 `rich` 上报的块，把嗅探结论包装成富内容负载复用现有渲染器；块头新增「渲染 / 原始」切换（嗅探结论可一键撤销，也是渲染器出错时的降级通道）。

### B3 历史模糊搜索（commit `f6aa91622`）
- `src/core/terminal/FuzzyMatch.ts`（新增）：子序列模糊匹配（大小写不敏感），打分偏向词首命中与连续命中，同分时最近使用排前；空查询按最新在前返回全部。8 个单测。
- `TerminalGuiView.vue`：GUI 输入行支持 **Ctrl+R** 弹出搜索面板（输入即过滤，↑↓ 或再按 Ctrl+R 换选，回车选中回填不直接执行，Esc 关闭），命中字符高亮。占位符更新为提示 Ctrl+R。

### B2 搜索（commit `490ef22d1`）
- 引入依赖 `@xterm/addon-search@0.16.0`（已写入 `package.json` 与 `pnpm-lock.yaml`）。
- `TerminalPane.vue`：终端视图走官方 `SearchAddon`（增量搜索、上/下一个、回车下一条 Shift+Enter 上一条）；搜索条悬浮于会话区右上角，工具栏新增搜索按钮。Ctrl+F 唤起——终端视图走 xterm 键处理链，GUI 视图走组件根按键捕获。
- `TerminalGuiView.vue`：GUI 视图自实现一套文本搜索——查询词下传后按块归一化输出做不区分大小写匹配，全部命中淡黄高亮、当前命中主题色标记，导航时把所在命令块 `scrollIntoView`，并回报 `当前/总数` 状态（`@search-status`）。

**批次 1 验证情况**：`pnpm run typecheck` 通过；终端相关单测 **84 个全绿**（path-detection 20 + content-sniff 15 + fuzzy-match 8 + command-blocks + rich-content）；`eslint` 所改文件零问题（仓库存量 4 个 error 与本次无关，位于 `src/core/file/TextFileStreamService.ts` 等未改文件）。**未运行应用内人工验证。**

---

## 3. 当前工作区中已修改/新增但未完成或未验证的内容

仅以下两个**未跟踪新文件**（其余批次 1 工作已全部提交，无未提交改动）：

- `src/core/terminal/ShellQuote.ts`（新增，58 行，未提交）：按目标 shell 家族转义/拼接命令片段的纯函数模块。
  - `ShellFamily = 'posix' | 'powershell' | 'cmd'`
  - `shellFamilyFor(sessionKind, localShell?)`、`quoteShellArg(text, family)`、`buildShellCdCommand`、`joinShellCommands`、`buildShellCommand(command, cwd, family)`
  - 用途：文件树「在终端打开」与预设命令（C2）会把用户可控文本（路径/参数）写进会话输入，**必须按 shell 转义**防注入。
- `tests/unit/shell-quote.test.ts`（新增，70 行，未提交）：9 个用例。

**未完成原因**：这是批次 2（C1 文件树 + C2 预设命令 L1）的前置基础设施，刚建好，尚未接后续 IPC / 面板。

**git status 注意**：
- `D doc/Nav-Tools*.docx/pdf` 与 `D doc/note.md` 是用户的文档清理改动，**与本终端工作无关，提交时勿纳入**。
- `?? doc/USER-MANUAL.md`、`?? doc/terminal-component/`（含本文档及 01–05 设计/路线图文档）是早前文档任务产物，亦非终端代码工作。

---

## 4. 测试与验证结果

| 范围 | 结果 | 说明 |
|---|---|---|
| `pnpm run typecheck` | ✅ 通过 | 批次 1 + ShellQuote 当前状态 |
| 终端相关单测（批次 1） | ✅ 84 个全绿 | path-detection 20、content-sniff 15、fuzzy-match 8、command-blocks、rich-content |
| `eslint`（所改文件） | ✅ 零问题 | 仓库存量 4 个 error 在非改动文件 |
| `shell-quote.test.ts` | ⚠️ **1 个失败**（9 中 8 通过） | 见下 |
| 应用内人工验证 | ❌ 未做 | 用户要求所有批次做完后统一验证 |

**唯一失败的测试**：`shell-quote.test.ts` 中 `escapes hostile cwd values instead of breaking the command` 用例。
- 现象：实际输出（如 `cd '/x'\''; rm -rf ~; '\'''; ls`）与测试里手写的期望字符串不一致。
- **初步判断（需接手者确认）**：源码的 POSIX 单引号转义 `'...'\''...'` 是**标准且正确的**——整个恶意输入会被变成 `cd` 的**单个参数**，`rm -rf ~` 不会作为独立命令执行，注入被挡住。失败很可能是**测试期望字符串写错**（手算的转义串少算了一个引号），而非源码 bug。
- **建议**：把该用例改为「断言转义结果是一个被单引号包裹的单一 token、内部不含未被转义的 `;`」，而非逐字符比字符串。不要为了过测而弱化转义逻辑。

---

## 5. 当前中断点

- 刚完成 `ShellQuote.ts`（批 2 前置）与它的单测；在核对单测时发现 1 个预期字符串错误（见 §4），随后用户叫停并要求写交接文档。
- 批次 2 的其余部分**尚未开始**：没有 `listSessionPath` 方法、没有新 IPC、没有 `TerminalFileTreePanel.vue` / `TerminalPresetPanel.vue`、没有在 `Terminal.vue` 接通面板。

---

## 6. 后续待办（按优先级与批次）

### 批次 2（C1 + C2，建议同批发布）
- **C1 文件树面板**
  - `TerminalService.listSessionPath(sessionId, rawPath)`：统一列目录，复用 B1 的 `resolveSessionPath` 解析根路径。
    - 本机：`fs.readdir` + 批量 `stat`（取 type/size，文件多时可 `Promise.all` 并设上限，如 2000 条）。
    - WSL：单次 `find "$1" -mindepth 1 -maxdepth 1 -printf '%y\t%s\t%f\n'`（GNU find 在各发行版都有，避免逐条 stat）。
    - SSH：复用 `listSftp`（绝对路径 `path.posix.join`）。
    - 返回 `{ resolvedPath, entries: SftpEntry[] }`，`SftpEntry` 类型已存在（`name/path/directory/size/modifiedAt/mode`），`mode` 不可得时置 0。
  - `electron/main/terminalIpc.ts`：新增 `terminal-session-list-dir`。
  - `src/components/windows/common/TerminalFileTreePanel.vue`（新）：`el-tree` 懒加载（`:load` + `node-key="path"`），一级列表 + 点击目录展开；点击文件 → 预览（复用 `terminal-path-read` + `TerminalRichContent`，内联底部预览区）；工具栏「在终端打开」→ `terminal-session-write` 写 `buildShellCdCommand(dir, family)`。
  - `Terminal.vue`：在 `TerminalSftpPanel` 旁增文件树面板开关（工具栏按钮，对**任意就绪会话**可用，不限于 SSH），参照现有 `activeSftpSessionByTabId` 模式加 `fileTreeSessionByTabId`。面板需 `sessionInfo`（id+kind+cwd）以选家族与兜底根路径（根传 `'.'`，由主进程按会话 cwd 解析）。
- **C2 预设命令 L1**（见 `05-roadmap.md §3.2`）
  - `src/core/terminal/TerminalPresetStorage.ts`（新）：localStorage 持久化 `TerminalPresetCommand { id, name, command, cwd? }`。
  - `src/components/windows/common/TerminalPresetPanel.vue`（新）：列出预设，运行/增/改/删（对话框）。
  - 执行：`buildShellCommand(command, cwd, shellFamilyFor(kind, localShell))` → `terminal-session-write` 写进当前 tab 聚焦会话（需在 `Terminal.vue` 找到该会话的 `pane.launch.localShell` 以确定家族）。
  - `Terminal.vue` 增面板开关与接线。

### 批次 3（C3，独立版本）
- 预设命令 **L2 表单工作流**：模板 `{{name:default|opt1|opt2}}` → 下拉/输入/勾选控件；填完拼成命令。
- **安全红线（来自路线图 §3.2）**：参数值插值进 shell 命令**必须按目标 shell 语义转义**（已备 `ShellQuote.ts`），bash 与 PowerShell 规则不同；转义要在主进程/写入前统一做，不散落 UI。需为「恶意参数值」补契约测试（参考 `shell-quote.test.ts` 的 hostile 用例写法）。

### 批次 4（C4 + C5）
- **C4 命令补全**：数据源用 **withfig（MIT 许可，可用）**；**禁止**用 Warp 的 `command-signatures-v2`（AGPL）。建议先做会话内历史补全（零数据依赖）打底，再接 withfig。
- **C5 块间导航**：命令块模型已就绪，加快捷键在块间跳转（上一块/下一块/跳到出错块）。

### 独立轨道（无用户可见收益，但终结 bug 源）
- 删除 `normalizeTerminalLayout`，块内容改从 `xterm.buffer.active` 派生（见 `04-design.md §8` 第 4 步）。应在 L1/L2 已覆盖多数高频命令、清楚「还有哪些命令仍依赖文本块」后再做。

---

## 7. 实现时需遵循的设计约束、安全边界与已知风险

### 设计约束（来自 `04-design.md`）
- **L1 嗅探先于 L2 包装**：优先零侵入嗅探，再考虑 shell 包装 `ls`/`cat`。
- **MIME 白名单 + 大小上限**（`SUPPORTED_RICH_MIMES` / `MAX_RICH_PAYLOAD_CHARS` / `MAX_BLOCK_OUTPUT_CHARS`）继续生效；任何新富内容类型都要纳入同一套上限。
- **Markdown 安全不变式**：`TerminalRichContent.vue` 用 `MarkdownLite` 先全文转义再变换，所以 `v-html` 安全。**若以后引入内嵌 HTML / mermaid，必须同步引入 DOMPurify**，否则破窗。
- **文件名不可信**：条目 `name` 可能含换行/控制字符/RTL 覆写字符——渲染时当不可信字符串（不拼 HTML、不拼命令），避免 XSS 与命令注入。
- **降级规则**：TODO 后续 L2 包装 `ls`/`cat` 时，遇到不理解的标志一律跳过上报、原样执行真实命令，永不比现状更差。

### 安全边界（许可）
- **Warp 是 AGPL-3.0**（仅 `warpui` 为 MIT）——**不可复制/改写其终端代码**，只可参考策略（如 `link_detection.rs` 的两级路径检测、`correlationKey` 关联键思路）。
- **withfig 数据集是 MIT**，可用于补全；**Warp `command-signatures-v2` 是 AGPL，禁止用**。
- **Shell 注入**：所有把用户文本写回会话的命令（文件树 `cd`、预设命令、L2 表单）必须经 `ShellQuote.ts` 转义，且转义在写入前于主进程/统一处完成。

### 已知风险
- **批次 1 未做应用内验证**：路径预览三通道、嗅探、Ctrl+R、Ctrl+F 只在单元/类型层面验证，未真机点过。统一验证时应重点试：WSL 路径预览、SSH 会话嗅探与搜索、大文件预览截断提示。
- **`@xterm/addon-search` 已进依赖但未跑构建**：仅 typecheck/eslint/vitest 通过，未 `pnpm build` / 未启动应用确认 SearchAddon 实际装载。
- **测试期望 bug**：`shell-quote.test.ts` 有 1 例失败（§4），先确认是测试期望写错而非转义逻辑错。
- **localShell 家族判定**：`ShellQuote.shellFamilyFor` 对 `system` 家族回退为 `powershell`（假设 Windows 默认 shell 为 PowerShell）；若平台为 macOS/Linux 且用 `system`，会有误判风险，需按 `capabilities.platform` 再校准。

---

## 8. 建议接手者首先检查的文件和命令

**先读设计（理解为什么这样做）**
- `doc/terminal-component/05-roadmap.md` —— 批次划分与「每项单独可发」原则。
- `doc/terminal-component/04-design.md` —— §1 三条路取舍、§3 `ls` 文件树载荷、§8 实施顺序（L1 嗅探先于 L2 包装）、§7.3 安全。
- `doc/terminal-component/01-requirements.md §4` —— 四层模型（L0 文本 / L1 嗅探 / L2 包装 / L3 配置化）。

**先跑命令确认基线（不修改任何东西）**
```bash
cd e:/Proj-Enhanced/02-上位机/Nav-Tools
pnpm run typecheck                  # 应全过
npx vitest run tests/unit/shell-quote.test.ts   # 当前 1 失败，确认是否为测试期望 bug
git status --short                  # 确认只有 ShellQuote.ts / shell-quote.test.ts 未跟踪，无其它源码改动
git log --oneline -5                # 确认批次 1 的 4 个提交
```

**续做批次 2 的起点文件**
- `src/core/terminal/ShellQuote.ts` —— 已就绪，直接复用。
- `electron/main/services/TerminalService.ts` —— 在 `listSftp` / `resolveSessionPath` 旁加 `listSessionPath`。
- `electron/main/terminalIpc.ts` —— 仿照 `terminal-path-read` 加 `terminal-session-list-dir`。
- `src/components/windows/common/TerminalSftpPanel.vue` —— 参考其 el-table / 路径归一化写法，但文件树用 `el-tree` 懒加载更合适。
- `src/components/windows/common/Terminal.vue` —— 参考 `activeSftpSessionByTabId` / `toggleActiveTabSftp` 模式，加文件树与预设面板的开关与状态。

**关键类型 / 复用点**
- `SftpEntry`（`src/core/terminal/TerminalTypes.ts`）—— 文件树条目复用此类型，避免新造。
- `TerminalGuiView.vue` 的 `terminal-path-read` 调用与 `TerminalRichContent` —— 文件树预览直接复用。
- `TerminalProfileStorage`（localStorage 模式）—— 预设命令 `TerminalPresetStorage` 照此写。
