# CodeBuddy 工作交接：终端命令感知渲染（批次 1–4 + xterm buffer 轨道）

> 本文档由 AI 在会话中断点整理，反映 **工作区实际状态**（已用 `git status` / `git log` / 只读文件检查核对）。
> 状态时间锚点：本地分支 `main`，HEAD = `ad97bf759`（批次 4 提交）。
> **批次 1–4 全部完成**，工作区干净。
> 批次 1 已 push 到 `origin/main`（截至 `67bc23319`）；批次 2–4 与文档提交（`e935fb907`、
> `34db6112f`、`c5eb3f5a9`、`8b84211bc`、`2e7eabb97`、`ad97bf759` 及本次文档同步）**仅本地提交，未 push**。
> 应用内人工验证**仍未做**——用户要求所有批次做完后统一验证（见 §5，这是当前唯一待办）。
> 本目录其余文档（README / 01 / 03 / 04 / 05）已同步至实现后状态，见 §9。

---

## 1. 用户目标与关键决策

- **终极目标**：把终端做成「命令感知」体验（对齐 Warp 的可选灵感），核心诉求是用户举例的原话：
  > “例如我执行了 `ls`，下面会呈现一个文件树……我 `cat` 一个 markdown 内容，也能看到 markdown 格式的文件。”
- **策略来源**：只抄 Warp 的**策略**，绝不复制/改写其 AGPL 代码（见 §7 许可边界）。
- **实施顺序决策**（来自 `doc/terminal-component/05-roadmap.md` 与 `04-design.md §8`）：
  - **L1 嗅探先于 L2 包装**。先用零侵入的内容嗅探覆盖长尾 + SSH 会话，再考虑 shell 函数包装 `ls`/`cat`。
  - 批次 1（B1–B4）、批次 2（C1 + C2）、批次 3（C3）、批次 4（C4 + C5）**全部完成**。
  - 四批之外的**独立轨道**（删除 `normalizeTerminalLayout`）**未做**，也未被要求做，见 §6。
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

### 批次 3：C3 预设命令 L2 表单工作流（commit `8b84211bc`）

- `src/core/terminal/CommandTemplate.ts`（新增）：纯函数模块，照 `ContentSniff` / `DirectoryListing` 的写法。
  - `parseCommandTemplate(command)` → `CommandTemplateField[]`：字段格式为 `{{name:默认值|选项1|选项2}}`，按首个 `:` 切 name/default、再按 `|` 切候选；**只取首个 `:`**，所以默认值里可以再含 `:`；同名占位符去重（以第一次出现为准）。
  - `interpolateCommandTemplate(command, values, family)` → 用 `quoteShellArg(value, family)` 转义后回填。缺值的字段回填其 `defaultValue`。
  - 12 个单测（`tests/unit/command-template.test.ts`）。
- `electron/main/services/TerminalService.ts`：新增 `runSessionCommand(sessionId, {command, cwd?, values?})` 与私有 `shellFamilyForSession(session)`。**shell 家族由主进程从会话自身推导**（`shellFamilyFor(session.info.kind, 本机会话的 localShell)`），渲染层传不进来，**无法谎报或漏转义**——这是对路线图 §3.2「转义要在主进程/写入前统一做」的落实。
- `electron/main/terminalIpc.ts`：新增 `terminal-session-run-command`。
- `src/components/windows/common/TerminalPresetPanel.vue`：移除 `kind` / `localShell` 两个 props（转义不再由渲染层决定，props 只留 `sessionId?`）；运行分两路——命令无 `{{...}}` 占位符直接执行，有则先弹 `el-dialog` 参数表单（候选 >1 用 `el-select` 下拉，否则 `el-input`，placeholder 显示默认值）；填过的值按预设 id 存进内存 Map（`lastValuesByPresetId`）下次回填，**不做持久化**。`execute()` 走 `terminal-session-run-command`，命令与参数值原样下发，转义交给主进程。
- `src/components/windows/common/Terminal.vue`：`TerminalPresetPanel` 改为 `<TerminalPresetPanel v-if="activePresetsOpen" :session-id="activeReadySessionId" />`；删掉 `activeReadyKind` / `activeReadyLocalShell` 两个 computed。
- `src/i18n/locales/{zh-CN,en-US}/common.ts`：新增 `presetCwdHint`、`presetCommandHint`（提示 `可用 {{参数名:默认值|选项1|选项2}} 生成运行时填写的表单`）、`presetParameters`。
- `tests/helpers/shell-tokens.ts`（新增）：共享测试助手 `splitPosixCommands(line): string[][]`，认识 `'...'\''...'` 转义，只用于测试断言。
- `tests/unit/shell-quote.test.ts`：hostile 用例改为导入共享 `splitPosixCommands`，不再在文件内各自实现一份分词。

**批次 3 验证情况**：`pnpm run typecheck` 通过；`npx vite build` 全绿；`eslint` 对所改文件零问题；`prettier --write` 已格式化；终端相关单测 **106 个全绿**（新增 command-template 12）；全量 `vitest run` 84 文件过 / 2 文件失败，均为 §4.1 的存量失败。**未运行应用内人工验证。**

### 批次 4：C4 命令补全 + C5 块间导航（commit `ad97bf759`）

C4 命令补全
- `src/core/terminal/CommandCompletion.ts`（新增）：纯函数模块，照 `ContentSniff` / `DirectoryListing` 的写法。
  - `completionToken(input, cursor)`：取光标所在 token 的区间**只按空白切分，不做引号解析**——引号内的 token 带着引号参与前缀匹配，自然匹配不到任何候选，于是不会在引号里弹出无意义的补全。
  - `completeCommandLine(input, cursor, history, specs?, limit?)`：**前缀匹配**（不是模糊匹配）。shell 补全的惯例就是前缀，Ctrl+R 已经提供模糊搜索，两者混在一个弹层里会让排序难以预测。
    - 命令位：内置规格的命令名在前，历史里用过的命令名补在后（最近优先），重名时以内置为准。
    - 第一个参数位：补子命令。以 `-` 开头：只补选项。更靠后的参数位没有规格可依，只取历史里**同命令、同参数位**出现过的 token。
  - `BUILTIN_SPECS`：手写的高频命令规格（git / npm / pnpm / yarn / docker / systemctl / ls / cat / cp / mv / rm / mkdir / grep / find / curl / ssh / scp / tar / unzip / make / python / node / chmod / chown / ps / kill / df / du / sed / jq / xargs / wsl / code）。
    - **许可边界**：命令名与选项是功能性事实，不受版权保护；这张表是按通用 CLI 常识手写的，**没有复制 withfig 或任何数据集的文件**。路线图 §3 C4 允许的数据源是 withfig（MIT）；若要覆盖长尾命令，将来应接 withfig 的数据文件，**禁止**用 Warp 的 `command-signatures-v2`（AGPL）。
  - 16 个单测（`tests/unit/command-completion.test.ts`）。
- `src/components/windows/common/TerminalGuiView.vue`：输入行新增补全弹层（浮层样式与 Ctrl+R 历史搜索同款）。
  - 触发：`Ctrl+Space` 显式唤起/收起；`Tab` 在有候选时唤起。接受：`Tab` 或 `Enter`。`↑↓` 换选，`Esc` 关闭，鼠标点击/mousemove 也可选。
  - 接受时替换**光标所在的那个 token**（`applyCompletion`），补到行尾时多补一个空格，这样 `gi`→`git `→`st`→`status` 的连续补全走得通。
  - 两个可达性/手感上的坑（已处理，改动时别退回去）：
    1. **空 token 上不拦 `Tab`**——否则光标停在空输入行时 Tab 会被永久吞掉，焦点出不去。
    2. **候选被输入过滤空时收起弹层并让按键按原义继续**，否则弹层空着时回车会被吞、什么都不发生。
  - 输入框补了 `ref="inputElement"`：候选要按光标位置算，接受后还要把光标移到替换文本末尾。
  - 补全与 Ctrl+R 互斥：开一个会关掉另一个。

C5 块间导航
- `src/components/windows/common/TerminalGuiView.vue`：**沿用搜索已有的「父级自增计数下传」模式**（`navPrevTick` / `navNextTick` / `navErrorTick`），所以快捷键在窗格内任意有焦点的位置都生效，不要求焦点一定在输入行。
  - `navIndex` 是当前选中块的下标，`-1` 表示还没导航过；没导航过时两个方向都从**最后一块（最新）**起算。
  - `jumpToErrorBlock()` 从后往前找第一个 `exitCode !== 0 && !== undefined` 的块；没有失败块就保持不动。
  - 选中块加主题色描边（`.is-nav-target`）；块列表变短时夹紧 `navIndex`。
  - 输入行右侧给了三个可点入口（仅 `blocks.length > 0` 时显示）——纯快捷键的功能等于藏起来了。
- `src/components/windows/common/TerminalPane.vue`：`handlePaneKeydown` 新增 `Alt+↑` / `Alt+↓` / `Alt+E`，且**仅在 GUI 视图生效**（终端视图没有块边界）。
- `src/i18n/locales/{zh-CN,en-US}/common.ts`：新增 `guiCompletionEmpty`、`completionCommand` / `completionSubcommand` / `completionOption` / `completionHistory`、`navPrevBlock` / `navNextBlock` / `navErrorBlock`；`guiInputPlaceholder` 补了 Tab 提示。

**批次 4 验证情况**：`pnpm run typecheck` 通过；`npx vite build` 全绿；`eslint` 对所改文件零问题；终端相关单测 **122 个全绿**（新增 command-completion 16）；全量 `vitest run` 85 文件过 / 574 测试过，2 个失败仍是 §4.1 的存量失败。**未运行应用内人工验证。**
- `prettier` 注意：本批改动里 `TerminalGuiView.vue` / `TerminalPane.vue` / `en-US/common.ts` 都被 `--check` 标红，但**这三个文件在 HEAD 上本来就不合规**（已用 `git show HEAD:<file>` 核对），所以只格式化了本批新建的两个文件，没顺手格式化存量文件。

---

## 3. 当前工作区中已修改/新增但未完成或未验证的内容

**无。工作区干净**（`git status` 无输出）。

批次 1 / 2 / 3 的全部代码都已本地提交。此前本节列出的两个未跟踪文件
（`src/core/terminal/ShellQuote.ts` 与 `tests/unit/shell-quote.test.ts`）已随批次 2 提交
（`34db6112f` / `e935fb907`）落库，不再是未跟踪状态。

`src/core/terminal/ShellQuote.ts` 仍是理解后续工作的关键模块（58 行）：
- `ShellFamily = 'posix' | 'powershell' | 'cmd'`
- `shellFamilyFor(sessionKind, localShell?)`、`quoteShellArg(text, family)`、`buildShellCdCommand`、`joinShellCommands`、`buildShellCommand(command, cwd, family)`
- 用途：文件树「在终端打开」、预设命令（C2）、L2 参数值（C3）都会把用户可控文本写进会话输入，**必须按 shell 转义**防注入。C3 起转义统一在主进程完成。

**git status 注意**：
- `D doc/Nav-Tools*.docx/pdf` 与 `D doc/note.md` 是用户的文档清理改动，**与本终端工作无关，提交时勿纳入**。
- `?? doc/USER-MANUAL.md`、`?? doc/terminal-component/`（含本文档及 01–05 设计/路线图文档）是早前文档任务产物，亦非终端代码工作。

---

## 4. 测试与验证结果

| 范围 | 结果 | 说明 |
|---|---|---|
| `pnpm run typecheck` | ✅ 通过 | 批次 1 + 2 + 3 + 4 当前状态 |
| `npx vite build` | ✅ 通过 | renderer + electron main + preload 全部编译成功 |
| 终端相关单测 | ✅ **122 个全绿** | path-detection 20、content-sniff 15、fuzzy-match 8、shell-quote 9、directory-listing 7、preset-storage 7、command-template 12、command-completion 16、command-blocks、rich-content |
| `eslint`（所改文件） | ✅ 零问题 | 仓库存量 4 个 error 在非改动文件 |
| `prettier --check`（所改文件） | ⚠️ 见 §2 批次 4 | `TerminalGuiView.vue` / `TerminalPane.vue` / `en-US/common.ts` **在 HEAD 上本就不合规**，只格式化了本批新建文件，未顺手格式化存量 |
| 全量 `vitest run` | ⚠️ 574 过 / 1 失败 / 1 文件收集失败 | 两个失败**与终端无关**，见 §4.1 |
| 应用内人工验证 | ❌ 未做 | 用户要求所有批次做完后统一验证；**四批已全部完成，这是当前唯一待办** |

### 4.1 两个存量失败（非本次改动引入，勿在终端任务里顺手修）
- `tests/unit/label-ocr.test.ts` —— OCR 模型断言失败（`expected 0 to be greater than or equal to 1`），属 `src/core/camera/LabelOcr` 范畴。
- `tests/unit/nsat-perf.test.ts` —— 收集阶段就崩：`readFileSync('C:\\Users\\ESSZ\\Desktop\\gnss-test\\rs.txt')` 硬编码了**别人机器上的绝对路径**，本机必然 ENOENT。

### 4.2 已修复的历史问题
- `shell-quote.test.ts` 的 hostile 用例：确认是**测试期望串写错**（手算的 `'...'\''...'` 少一个引号），源码转义正确。已改为分词断言，不再逐字符比字符串（详见 §2）。

---

## 5. 当前中断点

- **批次 1–4 全部完成并本地提交**，工作区干净（`git status` 无输出）：
  - 批次 1：B1 路径预览、B4 内容嗅探、B3 历史搜索、B2 搜索（4 个提交，已 push）
  - 批次 2：C1 文件树 + C2 预设命令 L1（`e935fb907`、`34db6112f`）
  - 批次 3：C3 预设命令 L2 表单工作流（`8b84211bc`）
  - 批次 4：C4 命令补全 + C5 块间导航（`ad97bf759`）
- 批次 2–4 与两次文档提交（`c5eb3f5a9`、`2e7eabb97`）**未 push**，按提交纪律 push 前需询问用户。
- **剩下的唯一一件事是应用内人工验证**——累计 9 处功能只在单元/类型/构建层面验证过，
  一次都没真机点过（见 §7 已知风险）。这步要由用户发起，不在 AI 这边自动跑。

---

## 6. 后续待办（按优先级与批次）

### ~~批次 3（C3，独立版本）~~ ✅ 已完成（commit `8b84211bc`）

- 预设命令 **L2 表单工作流**已落地：模板 `{{name:default|opt1|opt2}}` → 下拉/输入控件，填完拼成命令。
- 实现落在 `src/core/terminal/CommandTemplate.ts`（纯函数 + 12 单测），UI 只消费结果。
- **安全红线已落实**：参数值插值前按目标 shell 语义转义（`ShellQuote.quoteShellArg`），
  且转义在**主进程** `TerminalService.runSessionCommand` 里按会话自身 shell 家族完成，
  渲染层不参与、也无法谎报家族。已补「恶意参数值」契约测试
  （`command-template.test.ts`，用共享 `splitPosixCommands` 分词断言结构，未手算转义串）。

### ~~批次 4（C4 + C5）~~ ✅ 已完成（commit `ad97bf759`）

- ~~**C4 命令补全**~~：已做。数据源策略见 §2 批次 4——**没有引入 withfig 的庞大数据集**，
  而是「历史补全打底 + 手写的高频命令规格」，纯前端零依赖。
  withfig（MIT）仍是后续要覆盖长尾命令时的合规升级路径；Warp `command-signatures-v2`（AGPL）依旧禁用。
- ~~**C5 块间导航**~~：已做。上一块 / 下一块 / 跳到最近出错块，快捷键 + 输入行可点入口双通道。

### 独立轨道（无用户可见收益，但终结 bug 源）—— 未做，也未被要求做
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
- **批次 1 + 2 + 3 + 4 均未做应用内验证**，累计 9 处只在单元/类型/构建层面验证过，未真机点过：
  1. 路径预览三通道（本机 / WSL / SSH）
  2. 内容嗅探（JSON/CSV/Markdown 富化 + 渲染/原始切换）
  3. Ctrl+R 历史模糊搜索
  4. Ctrl+F 搜索（终端视图 SearchAddon / GUI 视图自实现两套）
  5. 文件树面板三通道列目录 + 文件预览 + 「在终端打开」写 `cd`
  6. 预设命令面板增删改运行
  7. 预设命令 **L2 参数表单**：占位符解析出下拉/输入控件、填值回填拼命令、主进程转义后写入
  8. **命令补全**：`gi`→Tab→`git `→`st`→Tab→`status` 的连续补全、选项补全（`git --`）、
     ↑↓ 换选、鼠标点选、以及**空输入行按 Tab 仍能移出焦点**
  9. **块间导航**：Alt+↑↓ 在多个块之间跳转、`Alt+E` 跳到出错块、选中块的描边是否可见、
     跳转到**被折叠的块**时是否仍滚到位
  统一验证时应重点试：**WSL 路径预览与文件树列目录**（`find -printf` 是否真能跑通、含空格/制表符的文件名）、**SSH 会话的嗅探与搜索**、**cmd 会话的 `cd /d` 是否正确**、大文件预览截断提示、**L2 表单在 PowerShell / cmd 会话里的转义结果**（同一条预设在 posix 与 powershell 下应得到不同转义串）。
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
git log --oneline -10                  # 批次 1 的 4 个 + 批次 2 的 2 个 + 文档 + 批次 3 + 文档 + 批次 4
npx vitest run tests/unit/shell-quote.test.ts tests/unit/directory-listing.test.ts \
  tests/unit/preset-storage.test.ts tests/unit/command-template.test.ts \
  tests/unit/command-completion.test.ts    # 51 个用例应全绿
```
全量 `vitest run` 会有 2 个与终端无关的存量失败（`label-ocr`、`nsat-perf`），见 §4.1，**不要误判成自己改坏了**。

**接手后唯一待办（应用内统一验证）的入手顺序**

四批代码都已提交且自动化检查全绿，所以接下来不是写代码，而是**真机点一遍 §7 列的 9 处**。
建议按「先高风险、后低风险」排：

1. **WSL 会话**：路径预览、文件树列目录（`find -printf` 是否真能跑通、含空格/制表符的文件名）——
   这是唯一有解析逻辑且跨进程的通道，最可能出问题。
2. **L2 参数表单的转义**：同一条预设分别在 Git Bash（posix）与 PowerShell / cmd 会话里跑一遍，
   确认参数值被正确转义、没有截断注入。
3. **SSH 会话**：内容嗅探、搜索、文件树三通道。
4. **GUI 视图交互**：Ctrl+R、Ctrl+F、补全（含连续补全与空行 Tab 不卡焦点）、块间导航。
5. **cmd 会话**的文件树「在终端打开」是否写出正确的 `cd /d`。

**验证时可能要改的文件（以及对应的坑）**
- `src/components/windows/common/TerminalGuiView.vue` —— GUI 视图的交互都在这里（补全弹层、
  块导航、Ctrl+R、Ctrl+F、路径预览、嗅探）。**注意这个文件在 HEAD 上就不符合 prettier**，
  改完后别对整个文件跑 `prettier --write`，否则 diff 爆炸。
- `src/components/windows/common/TerminalPane.vue` —— 窗格根按键捕获（Ctrl+F、Alt+↑↓、Alt+E）
  与下传计数。**同样本就不符合 prettier。**
- `src/core/terminal/CommandCompletion.ts` —— 补全候选计算；`BUILTIN_SPECS` 要加命令就改这张表。
- `src/core/terminal/CommandTemplate.ts`（批次 3）—— L2 模板解析与参数转义。
- `electron/main/services/TerminalService.ts` —— **shell 转义的唯一落点**（`runSessionCommand`）。
  注意 `electron/` 不在 `pnpm typecheck` 覆盖范围内（见 §7），改完必须人工审阅 + `vite build`。

**批次 2 已落地的代码（改动时先看这些）**
- `electron/main/services/TerminalService.ts` —— `listSessionPath`，与 `statSessionPath` / `readSessionPath` 共用 `resolveSessionPath`。
- `src/core/terminal/DirectoryListing.ts` —— WSL `find` 输出解析，唯一有单测覆盖的三通道解析逻辑。
- `src/components/windows/common/TerminalFileTreePanel.vue` —— `el-tree` 懒加载；注意根节点走 `loadNode.level === 0` + 内部 `rootPath`，换根靠递增 `treeKey` 重挂载，不是改 `data`。
- `src/components/windows/common/Terminal.vue` —— `activeReadySession` / `localShellForSession` 是文件树与预设面板共用的目标会话解析逻辑。

**关键类型 / 复用点**
- `SftpEntry`（`src/core/terminal/TerminalTypes.ts`）—— 文件树条目复用此类型，避免新造。
- `TerminalGuiView.vue` 的 `terminal-path-read` 调用与 `TerminalRichContent` —— 文件树预览直接复用。
- `TerminalProfileStorage`（localStorage 模式）—— 预设命令 `TerminalPresetStorage` 已照此写好。

---

## 9. 设计文档同步记录（2026-09-01，批次 4 之后补）

四批做完后，本目录其余设计/路线图文档还停留在「未开工」状态，已逐一同步：

| 文档 | 同步内容 |
|---|---|
| `README.md` | 状态快照改为「实现完成，待统一验证」；决策记录补实际落地情况；5 个待拍板问题标注实现给出的答案（多数被绕过或已回答） |
| `01-requirements.md` §5 | 4 个待拍板问题标注结论——**「是否覆盖内建命令」因未做包装而消解** |
| `03-implementation.md` | 头部注明本文只覆盖 v1.5.0、批次 1–4 见本文档；§0.2 关键文件表补批次 1–4 新增的 8 个核心模块与 2 个面板；§0.4 补「目录点击无效」边界 |
| `04-design.md` | 状态改「已实现但有偏离」；**新增 §11 实施结果对照**：实际走「嗅探 + 路径检测→直读文件系统 + 侧边文件树」，未按原设计的「包装 `ls`/`cat`」走，原因与影响全记录 |
| `05-roadmap.md` | 状态改「批次 1–4 已全部实现」；§1 决策表补落地情况（决策 2 未落地）；§2 现状基线的「缺失」清单标记已补齐；§3/§4 逐项标注完成状态；§6 待定更新 |

### 9.1 同步过程中发现的重要 gap：目录点击不能就地展开文件树

这是**路线图 §1 决策 2**（「目录点击 = 就地展开文件树」）与**用户核心原话**
（「我执行了 `ls`，下面会呈现一个文件树」）的残余差距，此前各批交接记录里没有显式记过：

- 现状：块输出里的**文件**名点击可预览；**目录**名点击后走 `terminal-path-read`，
  读目录失败，显示「无法读取该文件（可能已删除、**是目录**或不支持预览）」。
- 根因：`terminal-path-stat` 明明已返回 `TerminalPathStat.directory`
  （`src/core/terminal/TerminalTypes.ts`），但 `TerminalGuiView.vue` 的
  `probePath` / `togglePreview` 只消费了 `exists`，从未检查 `directory`。
- 目录浏览目前由 C1 侧边文件树面板承担，所以功能上「能浏览目录」，
  但「敲 `ls` 后在命令块下面直接长出树」这个最初诉求没有闭环。

**若要补齐**（改动很小，数据通道全现成）：`togglePreview` 里对 `directory: true`
的路径改走 `terminal-session-list-dir`（批次 2 已建好三通道列目录 IPC），
预览区复用 `TerminalFileTreePanel` 的 `el-tree` 就地懒加载展开。
是否做、什么时候做待用户拍板（已记入 `05-roadmap.md` §6 与 `04-design.md` §11.3）。

**统一验证时注意**：点目录出现「无法读取」提示**不是 bug**，是上述已知 gap；
验证清单（§7 第 5 项）里「文件预览」应理解为文件而非目录。
