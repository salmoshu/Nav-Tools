# CodeBuddy 工作交接：终端命令感知渲染（批次 1–4 + xterm buffer 轨道）

> 本文档由 AI 在会话中断点整理，反映 **工作区实际状态**（已用 `git status` / `git log` / 只读文件检查核对）。
> 状态时间锚点：本地分支 `main`，HEAD = `34db6112f`（批次 2 提交）。
> 批次 1 已 push 到 `origin/main`（截至 `67bc23319`）；批次 2 的两个提交（`e935fb907`、`34db6112f`）
> **仅本地提交，未 push**。
> 应用内人工验证**仍未做**——用户要求所有批次做完后统一验证。

---

## 1. 用户目标与关键决策

- **终极目标**：把终端做成「命令感知」体验（对齐 Warp 的可选灵感），核心诉求是用户举例的原话：
  > “例如我执行了 `ls`，下面会呈现一个文件树……我 `cat` 一个 markdown 内容，也能看到 markdown 格式的文件。”
- **策略来源**：只抄 Warp 的**策略**，绝不复制/改写其 AGPL 代码（见 §7 许可边界）。
- **实施顺序决策**（来自 `doc/terminal-component/05-roadmap.md` 与 `04-design.md §8`）：
  - **L1 嗅探先于 L2 包装**。先用零侵入的内容嗅探覆盖长尾 + SSH 会话，再考虑 shell 函数包装 `ls`/`cat`。
  - 批次 1（B1–B4）已按此完成；批次 2（C1 文件树 + C2 预设命令 L1）已完成；下一步是批次 3（C3）。
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

### 批次 2：C1 文件树 + C2 预设命令 L1（2 个提交）

前置修复（commit `e935fb907`）
- `tests/unit/shell-quote.test.ts`：原 hostile 用例的期望串手算少一个引号。改为**按 POSIX 语义分词后断言结构**（`splitPosixCommands` 辅助函数，只切未被引号包裹的 `;`，认识 `'...'\''...'` 转义），断言结果是 `[['cd', <恶意原始串>], ['ls']]`。转义逻辑未弱化。

C1 文件树面板（commit `34db6112f`）
- `src/core/terminal/DirectoryListing.ts`（新增）：`parseFindListing` 解析 WSL 侧 `find -printf '%y\t%s\t%T@\t%f\n'`；文件名是最后一列且可含制表符，所以只在前三个分隔符处切开；`sortDirectoryEntries` 目录在前 + 字典序，与 SFTP 侧顺序一致。7 个单测（`tests/unit/directory-listing.test.ts`）。
- `src/core/terminal/TerminalTypes.ts`：新增 `TerminalSessionDir { resolvedPath, entries }`。
- `electron/main/services/TerminalService.ts`：新增 `listSessionPath(sessionId, rawPath)`，复用 B1 的 `resolveSessionPath` 与三通道——本机 `fs.readdir` + 批量 `stat`（`MAX_DIR_ENTRIES = 2000`，单条 stat 失败只降级该条目）、WSL 单次 `find`（路径以 `$1` 传入，不拼进脚本）、SSH 复用 `listSftp`。排序统一走 `sortDirectoryEntries`。
- `electron/main/terminalIpc.ts`：新增 `terminal-session-list-dir`。
- `src/components/windows/common/TerminalFileTreePanel.vue`（新）：`el-tree` 懒加载（`node-key="path"`，`isLeaf` 由 `directory` 反推），根路径默认 `'.'` 由主进程按会话 cwd 解析；点击文件 → `terminal-path-read` + `TerminalRichContent` 底部预览；工具栏「在终端打开」→ `buildShellCdCommand` 转义后 `terminal-session-write`（末尾 `\r` 代替回车）。宽度用 CSS `resize: horizontal`，没有照搬 SFTP 面板的 JS 拖拽逻辑。

C2 预设命令 L1（同一提交）
- `src/core/terminal/TerminalPresetStorage.ts`（新）：localStorage 持久化 `TerminalPresetCommand { id, name, command, cwd? }`，key `nav-tools:terminal-presets:v1`；`list()` 对单条脏数据逐条跳过而不整体失败；空 `cwd` 不落库。
- `src/components/windows/common/TerminalPresetPanel.vue`（新）：列表 + 运行 / 编辑 / 删除，增改用 `el-dialog` 表单；运行走 `buildShellCommand(command, cwd, shellFamilyFor(kind, localShell))` 再 `terminal-session-write`。没有就绪会话时运行按钮禁用。
- `src/components/windows/common/Terminal.vue`：新增 `fileTreeSessionByTabId` / `presetOpenByTabId` 两个 per-tab 状态与对应工具栏按钮（文件树 `Files` 图标、预设 `Lightning` 图标）；新增 `activeReadySession` 计算属性（聚焦窗格优先，否则第一个就绪会话）与 `localShellForSession`（从 pane 的 `launch` 取 `localShell` 定 shell 家族）。文件树面板对**任意就绪会话**可用（不限于 SSH）；清理逻辑（tab 关闭 / pane 关闭 / 会话重连换 id）与 SFTP 面板同构。
- `src/i18n/locales/{zh-CN,en-US}/common.ts`：新增 `fileTree*`、`preset*`、`refresh`、`save` 等键（两种语言已对齐）。

**批次 1 验证情况**：`pnpm run typecheck` 通过；终端相关单测 **84 个全绿**（path-detection 20 + content-sniff 15 + fuzzy-match 8 + command-blocks + rich-content）；`eslint` 所改文件零问题（仓库存量 4 个 error 与本次无关，位于 `src/core/file/TextFileStreamService.ts` 等未改文件）。**未运行应用内人工验证。**

**批次 2 验证情况**：`pnpm run typecheck` 通过；`npx vite build`（renderer + electron main + preload）全绿；`eslint` 与 `prettier --check` 对所改文件零问题；终端相关单测 **94 个全绿**（新增 directory-listing 7、preset-storage 7，shell-quote 修复后 9 全过）。**未运行应用内人工验证。**

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
| `pnpm run typecheck` | ✅ 通过 | 批次 1 + 批次 2 当前状态 |
| `npx vite build` | ✅ 通过 | renderer + electron main + preload 全部编译成功 |
| 终端相关单测 | ✅ **94 个全绿** | path-detection 20、content-sniff 15、fuzzy-match 8、shell-quote 9、directory-listing 7、preset-storage 7、command-blocks、rich-content |
| `eslint`（所改文件） | ✅ 零问题 | 仓库存量 4 个 error 在非改动文件 |
| `prettier --check`（所改文件） | ✅ 零问题 | 仓库里 `TerminalGuiView.vue` / `TerminalPane.vue` / `terminalIpc.ts` 等**存量文件本就不合规**，不要顺手格式化，否则 diff 爆炸 |
| 全量 `vitest run` | ⚠️ 546 过 / 1 失败 / 1 文件收集失败 | 两个失败**与终端无关**，见 §4.1 |
| 应用内人工验证 | ❌ 未做 | 用户要求所有批次做完后统一验证 |

### 4.1 两个存量失败（非本次改动引入，勿在终端任务里顺手修）
- `tests/unit/label-ocr.test.ts` —— OCR 模型断言失败（`expected 0 to be greater than or equal to 1`），属 `src/core/camera/LabelOcr` 范畴。
- `tests/unit/nsat-perf.test.ts` —— 收集阶段就崩：`readFileSync('C:\\Users\\ESSZ\\Desktop\\gnss-test\\rs.txt')` 硬编码了**别人机器上的绝对路径**，本机必然 ENOENT。

### 4.2 已修复的历史问题
- `shell-quote.test.ts` 的 hostile 用例：确认是**测试期望串写错**（手算的 `'...'\''...'` 少一个引号），源码转义正确。已改为分词断言，不再逐字符比字符串（详见 §2）。

---

## 5. 当前中断点

- 批次 1（B1–B4）与批次 2（C1 文件树 + C2 预设命令 L1）**均已完成并本地提交**，工作区干净（`git status` 无输出）。
- 批次 2 的两个提交**未 push**（`e935fb907`、`34db6112f`），按提交纪律 push 前需询问用户。
- 下一步是**批次 3（C3 预设命令 L2 表单工作流）**，尚未开始。
- 仍未做应用内人工验证——累计已有 6 个功能未真机点过（见 §7 已知风险）。

---

## 6. 后续待办（按优先级与批次）

### 批次 3（C3，独立版本）
- 预设命令 **L2 表单工作流**：模板 `{{name:default|opt1|opt2}}` → 下拉/输入/勾选控件；填完拼成命令。
  - 起点：`TerminalPresetStorage` 的 `command` 字段已可承载模板串，`TerminalPresetPanel.vue` 的运行路径已统一走 `buildShellCommand`。
  - 建议把「模板解析 → 参数控件描述」做成 `src/core/terminal/` 下的纯函数模块（照 `ContentSniff` / `DirectoryListing` 的写法），配单测，UI 只消费结果。
- **安全红线（来自路线图 §3.2）**：参数值插值进 shell 命令**必须按目标 shell 语义转义**（已备 `ShellQuote.ts`），bash 与 PowerShell 规则不同；转义要在主进程/写入前统一做，不散落 UI。需为「恶意参数值」补契约测试（参考 `shell-quote.test.ts` 的 hostile 用例写法——**用分词断言结构，别手算转义串**）。

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
- **批次 1 + 2 均未做应用内验证**，累计 6 处只在单元/类型/构建层面验证过，未真机点过：
  1. 路径预览三通道（本机 / WSL / SSH）
  2. 内容嗅探（JSON/CSV/Markdown 富化 + 渲染/原始切换）
  3. Ctrl+R 历史模糊搜索
  4. Ctrl+F 搜索（终端视图 SearchAddon / GUI 视图自实现两套）
  5. 文件树面板三通道列目录 + 文件预览 + 「在终端打开」写 `cd`
  6. 预设命令面板增删改运行
  统一验证时应重点试：**WSL 路径预览与文件树列目录**（`find -printf` 是否真能跑通、含空格/制表符的文件名）、**SSH 会话的嗅探与搜索**、**cmd 会话的 `cd /d` 是否正确**、大文件预览截断提示。
- **`@xterm/addon-search` 已补装**：之前只在 `package.json` / lockfile 里、实际未进 `node_modules`，导致 `pnpm typecheck` 报 `Cannot find module '@xterm/addon-search'`。已 `pnpm install` 装上（该命令末尾对 `@esbuild/linux-x64` 报 EACCES 权限错，但目标包已落地，不影响）。`vite build` 已通过，但**仍未启动应用确认 SearchAddon 实际装载**。
- **electron 侧没有真正的类型检查**：`tsconfig.json` 的 `include` 只有 `src`，`pnpm typecheck`（= `vue-tsc --noEmit`）**不覆盖 `electron/`**；`tsconfig.node.json` 配置不完整（缺 `target`，直接跑有一堆 `downlevelIteration` 之类报错），处于废弃状态。改 `electron/main/**` 时**类型错误不会被 CI 抓到**，只能靠 `vite build`（只查语法/导入，不查类型）与人工审阅。
- **`resolveSessionPath` 在会话 cwd 未知时行为可疑**：WSL/SSH 分支里 `cwd` 兜底为 `'~'`，再 `path.posix.resolve('~', '.')` 会解析到**主进程 cwd 下的字面 `~` 目录**，而不是用户家目录。B1 的路径预览与 C1 的文件树共用此逻辑，所以 WSL 会话若没上报 OSC 7 cwd，两条功能都会拿到错路径。修它属于独立小修，别混在 C3 里。
- **localShell 家族判定**：`ShellQuote.shellFamilyFor` 对 `system` 家族回退为 `powershell`（假设 Windows 默认 shell 为 PowerShell）；若平台为 macOS/Linux 且用 `system`，会有误判风险，需按 `capabilities.platform` 再校准。
- **`MAX_DIR_ENTRIES = 2000` 是静默截断**：`listSessionPath` 超过上限直接丢尾部，不回传标志。若在 `/` 或 `node_modules` 上列目录，用户会以为文件「不见了」。要不要给 `TerminalSessionDir` 加 `truncated` 字段，留给验证时看实际观感再定。

---

## 8. 建议接手者首先检查的文件和命令

**先读设计（理解为什么这样做）**
- `doc/terminal-component/05-roadmap.md` —— 批次划分与「每项单独可发」原则。
- `doc/terminal-component/04-design.md` —— §1 三条路取舍、§3 `ls` 文件树载荷、§8 实施顺序（L1 嗅探先于 L2 包装）、§7.3 安全。
- `doc/terminal-component/01-requirements.md §4` —— 四层模型（L0 文本 / L1 嗅探 / L2 包装 / L3 配置化）。

**先跑命令确认基线（不修改任何东西）**
```bash
cd d:/projects/03-上位机/Nav-Tools     # 注意：仓库实际路径是 d: 盘，旧文档里的 e:/Proj-Enhanced/... 已失效
pnpm run typecheck                     # 应全过（注意：不覆盖 electron/，见 §7）
npx vite build                         # renderer + electron main + preload，应全过
git status --short                     # 应无输出（工作区干净）
git log --oneline -6                   # 确认批次 1 的 4 个提交 + 批次 2 的 2 个提交
npx vitest run tests/unit/shell-quote.test.ts tests/unit/directory-listing.test.ts \
  tests/unit/preset-storage.test.ts    # 23 个用例应全绿
```
全量 `vitest run` 会有 2 个与终端无关的存量失败（`label-ocr`、`nsat-perf`），见 §4.1，**不要误判成自己改坏了**。

**续做批次 3（C3 预设命令 L2 表单）的起点文件**
- `src/components/windows/common/TerminalPresetPanel.vue` —— 运行路径已统一走 `buildShellCommand`，加表单只需在「运行」前插入模板解析与参数收集。
- `src/core/terminal/TerminalPresetStorage.ts` —— `command` 字段可直接承载模板串，无需改存储结构（除非想单独存模板元数据）。
- `src/core/terminal/ShellQuote.ts` —— 参数值转义的唯一入口，L2 的参数值同样必须经它。

**批次 2 已落地的代码（改动时先看这些）**
- `electron/main/services/TerminalService.ts` —— `listSessionPath`，与 `statSessionPath` / `readSessionPath` 共用 `resolveSessionPath`。
- `src/core/terminal/DirectoryListing.ts` —— WSL `find` 输出解析，唯一有单测覆盖的三通道解析逻辑。
- `src/components/windows/common/TerminalFileTreePanel.vue` —— `el-tree` 懒加载；注意根节点走 `loadNode.level === 0` + 内部 `rootPath`，换根靠递增 `treeKey` 重挂载，不是改 `data`。
- `src/components/windows/common/Terminal.vue` —— `activeReadySession` / `localShellForSession` 是文件树与预设面板共用的目标会话解析逻辑。

**关键类型 / 复用点**
- `SftpEntry`（`src/core/terminal/TerminalTypes.ts`）—— 文件树条目复用此类型，避免新造。
- `TerminalGuiView.vue` 的 `terminal-path-read` 调用与 `TerminalRichContent` —— 文件树预览直接复用。
- `TerminalProfileStorage`（localStorage 模式）—— 预设命令 `TerminalPresetStorage` 已照此写好。
