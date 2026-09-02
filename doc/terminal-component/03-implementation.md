# v1.5.0 终端 GUI 视图：设计与实现记录

> 状态：**P1/P2/P3 + 打磨已全部实现**，已推送远程。
> AI agent 集成（ACP）已明确移出范围——用户不需要接入 AI 助手，
> GUI 视图的目标聚焦在「终端富文本化」本身。
> 调研依据见 `research/research-notes.md`；需求口径见 `01-requirements.md`；
> 下一步设计见 `04-design.md`。
>
> 本文只覆盖 **v1.5.0（GUI 块视图）**。其后的命令感知渲染批次 1–4
> （路径预览 / 嗅探 / 搜索 / 文件树 / 预设命令 / 补全 / 块导航）的逐文件实现记录
> 见 **`codebuddy-work.md`**；与原设计的偏离见 `04-design.md` §11。

## 0. 实现速览（先读这一节）

### 0.1 一句话架构

终端窗格有两种呈现（`presentation: 'terminal' | 'gui'`，按 pane 持久化）。
**两种视图消费同一个会话**：主进程输出链路零改动，OSC 解析与块装配全部落在
renderer 的 `CommandBlockAssembler`，按当前 `presentation` 把输出分发给
xterm 或 `TerminalGuiView`。视图切换只换消费者。

### 0.2 关键文件

v1.5.0 本体：

| 层 | 文件 | 职责 |
|---|---|---|
| 装配 | `src/core/terminal/CommandBlocks.ts` | `CommandBlockAssembler`（OSC 133/1338/OSC 7/OSC 9;9 解析、块装配）、`normalizeTerminalLayout`（文本归一化） |
| 视图 | `src/components/windows/common/TerminalGuiView.vue` | GUI 块列表、折叠、复制、重跑、底部输入行 |
| 视图 | `src/components/windows/common/TerminalPane.vue` | xterm 宿主 + 装配器挂载 + `presentation` 分发 + 降级判定 |
| 富内容 | `src/components/windows/common/TerminalRichContent.vue` | MIME 白名单分发（markdown/json/csv/image） |
| 富内容 | `MarkdownLite.ts` / `CsvLite.ts` / `TerminalJsonTree.vue` | 零依赖自实现渲染器 |
| 注入 | `electron/main/services/TerminalService.ts` | bash（`PROMPT_COMMAND` + DEBUG trap）、PowerShell（启动参数）、`nav-render` |
| 持久化 | `src/core/terminal/TerminalLayout.ts`、`TerminalWorkspaceStorage.ts` | `TerminalPaneNode.presentation` |
| i18n | `src/i18n/locales/{zh-CN,en-US}/common.ts` | `terminal.*` 键（含 `guiDegradedHint`、`guiInputPlaceholder` 等） |
| 测试 | `tests/unit/command-blocks.test.ts`、`tests/unit/terminal-rich-content.test.ts`、`tests/e2e/v150-terminal-gui-view.spec.ts` | |

批次 1–4（命令感知渲染）新增模块，详见 `codebuddy-work.md`：

| 层 | 文件 | 职责 |
|---|---|---|
| 路径 | `src/core/terminal/PathDetection.ts` | 输出内路径候选检测（两级策略）+ 按路径切片 |
| 嗅探 | `src/core/terminal/ContentSniff.ts` | 高置信度内容识别（JSON / CSV / Markdown） |
| 搜索 | `src/core/terminal/FuzzyMatch.ts` | 历史模糊搜索打分 |
| 目录 | `src/core/terminal/DirectoryListing.ts` | WSL `find -printf` 输出解析 + 排序 |
| 转义 | `src/core/terminal/ShellQuote.ts` | 按 shell 家族（posix/powershell/cmd）转义与拼命令 |
| 预设 | `src/core/terminal/TerminalPresetStorage.ts`、`CommandTemplate.ts` | 预设持久化；`{{name:默认|选项}}` 模板解析与插值 |
| 补全 | `src/core/terminal/CommandCompletion.ts` | 光标 token 前缀补全（历史 + 手写规格表） |
| 面板 | `TerminalFileTree.vue`、`TerminalFileTreePanel.vue`、`TerminalPresetPanel.vue` | 共享会话文件树、侧边文件树面板、预设列表 + L2 参数表单 |
| IPC | `electron/main/terminalIpc.ts` | `terminal-path-stat/read`、`terminal-session-list-dir/run-command` |
| 测试 | `tests/unit/path-detection / content-sniff / fuzzy-match / directory-listing / shell-quote / preset-storage / command-template / command-completion .test.ts` | 终端单测共 122 个 |

### 0.3 三条不变量（踩坑得来，改注入前必读）

均记在 `TerminalService.ts:40-55` 的注释里，**任何新增注入都必须满足**：

1. **C 标记必须写到启动时保存的终端 fd（`>&$__nav133_fd`）**，不能写 stdout
   —— 否则 `for ... done > f`、`echo x > f` 会把 OSC 序列吞进用户文件，
   终端反而收不到，GUI 出现「（未捕获命令）」且用户文件被控制字节污染。
2. **`__nav133_emit` 标志保证每条命令行只发一次 C**——复合命令（for/while）
   会对循环体每条子命令触发 DEBUG；PROMPT_COMMAND 末尾重新置位，
   且**必须是最后一条语句**。
3. **PROMPT_COMMAND 执行期间必须摘掉 DEBUG trap（`trap - DEBUG`）**
   —— 空回车/Ctrl+C 不消耗 trap，否则 OSC7 `printf` 与 `trap` 语句会被当成
   用户命令上报，产生幻影块。注意 `trap - DEBUG` 必须是 PROMPT_COMMAND 的
   **直接语句**（bash 实测：包成函数调用不生效）。

补充内部命名约定：内部命令统一用 `__nav133_` 前缀，以被 DEBUG 过滤器
（`__nav133*|*__nav_e*|"trap "*`）放行，避免产生幻影块。

### 0.4 已知边界 / 遗留问题

- **`normalizeTerminalLayout` 是在重造终端模拟器**（约 160 行，处理 CUP/CR/
  延迟折行/ECH/EL/宽字符）。已三进三出（行单元 → 屏幕行号映射 → 折行续写），
  ConPTY 的每种翻译癖好都变成一个新 bug。**公认应删除、改为从
  `xterm.buffer.active` 派生块内容**（依据见 `02-research.md` §3.1）。
- **less / vim 的 alternate-screen 帧**：同模型下互相覆盖，只剩最后一帧
  （用户已知，未处理；如需再按 `?1049` 单开）。
- **SSH / cmd 会话不注入** → GUI 视图降级为终端渲染 + 提示条（`guiDegraded`）。
- **PowerShell 只上报 A/D**（无 preexec），命令文本拿不到，整段成块。
- **输出内路径点击已区分文件与目录**（2026-09-02 T1）：文件继续走有大小上限的块内预览；
  目录走共享 `TerminalFileTree.vue` 就地懒加载，与侧边面板复用同一三通道列目录能力。
- 单元测试外的既有失败项与本特性无关（`nsat-perf`、`label-ocr`）。
- **P4（富结果接入 Dashboard/CardWindow 布局）待实施**。

## 1. 目标

用户原话：「在终端组件中，我可以配置为当前终端的样子，或者配置为 GUI 的样子。」「我只是希望终端更加富文本，类似 Kimi Web 一样。」

即：Terminal 组件的每个窗格（pane）可以在两种呈现方式之间选择——

- **终端视图**：现状，xterm.js 字符网格，完整兼容 Shell/TUI；
- **GUI 视图**：消费同一会话的结构化事件，用 Vue 原生组件呈现（命令块、Markdown/JSON/CSV/图片等富内容），阅读与审美体验对齐 Kimi Web 的块式排版——但**不包含任何 AI 助手集成**。

## 2. 核心架构判断

GUI 视图**不能**靠解析 ANSI 字符流「美化」出来。字符流是渲染结果的压扁形式，语义已经丢失；从它反推结构（哪段是命令、哪段是提示符、哪段是 Markdown）必然脆弱。正确做法复用 Kimi Web 的架构：

```text
                ┌─────────────────────────────┐
                │   会话核心（不产生界面语义）  │
                │  PTY 字节流 + 结构化事件      │
                └───────┬─────────────┬───────┘
                        │             │
                 SessionFrame    SessionFrame
                 { kind:'pty' }  { kind:'semantic' }
                        │             │
                ┌───────▼───┐   ┌─────▼──────┐
                │ 终端视图   │   │  GUI 视图   │
                │ xterm.js  │   │ Vue 组件树  │
                └───────────┘   └────────────┘
```

`SessionFrame` 联合类型（讨论期草案，实现时可调整）：

```ts
type SessionFrame =
  | { kind: 'pty'; data: string }                 // 原始字节，喂给 xterm
  | { kind: 'semantic'; event: StructuredSessionEvent } // 结构化事件，喂给 GUI 视图

type Presentation = 'terminal' | 'gui'
```

两种视图消费同一会话，不回 fork 会话生命周期：标签、分屏、SSH 重连、cwd 跟踪、scrollback、SFTP 的行为在两种视图下完全一致。

## 3. 分歧裁决记录

### 3.1 界面模型：两态切换，而非三态 auto

**结论：`Presentation = 'terminal' | 'gui'`，用户手动配置，无 `auto` 状态。**

理由：

- 用户的原始诉求就是「我可以配置为……或者……」，是显式选择，不是自动猜测。
- auto 模式必然引入「系统替用户做决定」的不可预期切换：同一会话里视图随输出内容跳动，破坏肌肉记忆，也让状态恢复（重启后我看到的视图是什么？）变得含糊。
- 「没有结构化事件时 GUI 视图怎么办」是**渲染层降级规则**，不是第三个用户状态：GUI 视图下若会话没有结构化事件源（普通 PowerShell/SSH 且未注入 OSC 133），视图降级为终端渲染并显示一次性轻提示，数据链路不中断，用户可一键切回。

### 3.2 已移除范围：AI agent 集成（原 P3，ACP 适配器）

**结论：v1.5.0 不实现 `AcpAdapter` / agent GUI 视图。**

原设计中 P3 计划通过 ACP（Agent Client Protocol）接入 Kimi Code 等 AI 助手，把 GUI 视图做成聊天式 agent 界面。用户明确不会接入 AI 助手，该方向整体砍掉，包括：

- `StructuredSessionAdapter` / ACP 子进程管理接口；
- 消息流、工具卡片、审批、diff 等 agent 专属渲染；
- Kimi Server WebSocket 适配器备选方案。

Kimi Web 对本项目仍有价值的部分是它的**呈现形态**（块式、富文本、按语义排版），而不是它的 agent 业务。富文本能力改由 Shell 命令块 + 显式富内容通道（§4）提供，不依赖任何外部 agent 进程。

## 4. 结构化事件模型

事件源统一归并为 `StructuredSessionEvent`：

1. **Shell 命令块（OSC 133，已实现）**：适用于本地 bash 系（git-bash/WSL，环境变量注入）与 PowerShell（启动参数注入，仅 A/D）。
   提示符/命令边界、退出码、命令文本归并为命令块 `{ command, startedAt, exitCode, output }`，支持折叠、复制、重跑、状态着色。
2. **显式富内容通道（后续阶段）**：程序主动向终端写出带 MIME 类型的内容块。
   借鉴 iTerm2 的 OSC 1337 内联图片与 Jupyter 的 MIME bundle：约定 Nav-Tools 私有 OSC 序列（如 `OSC 1338 ; <mime> ; <base64>`），装配器识别后产出富内容块；每个结果至少带 `text/plain` 回退，可选 `text/markdown`、`application/json`、`image/png` 等。前端维护**白名单 renderer 注册表**，逐项显式实现，不接受任意 HTML。
   配套提供一个小的 `nav-render` 辅助命令（shell 函数/脚本，随注入分发），让用户和脚本可以 `nav-render report.md` 这样直接输出富内容块。

## 5. 模块边界（seam）

- **renderer 内**：`TerminalPane.vue` 保持 xterm 渲染职责；`CommandBlockAssembler`（`src/core/terminal/CommandBlocks.ts`）挂在数据入口，把输出流装配为命令块，按当前 `Presentation` 分发到 xterm 或 `TerminalGuiView.vue`。视图切换只换消费者，不动会话。
- **跨进程（Electron main↔renderer，自有 seam）**：不新增通道。注入只在会话创建时经环境变量/启动参数完成（`TerminalService.ts`），输出仍走既有 `terminal-output` 事件。
- **持久化**：`Presentation` 按 pane 存进 `TerminalWorkspaceStorage` 的布局持久化中，重启/分离窗口恢复后视图选择不变。

## 6. 分阶段计划

| 阶段 | 内容 | 状态 |
|---|---|---|
| P1 | OSC 133 命令块：注入/解析命令边界，GUI 视图内折叠、状态色、复制、重跑 | ✅ 已实现 |
| P2 | `Presentation` 两态切换 + GUI 视图骨架：命令块列表、无事件源时的降级与切回提示 | ✅ 已实现 |
| P3 | 富内容通道：私有 OSC 序列 + 白名单 renderer 注册表，首批 Markdown、JSON 树、CSV、图片；`nav-render` 辅助命令 | ✅ 已实现 |
| P4 | 富结果接入 Dashboard/CardWindow 布局，命令结果可打开为图表或独立卡片 | 待实施 |

## 7. 安全

- 只渲染白名单 MIME 类型；每种 renderer 单独评审。
- 必须显示 HTML 时：严格清洗 + 无脚本、无同源权限的 sandbox iframe。
- 远端（SSH）输出同样可能携带富内容序列，所有富内容渲染必须假定输入不可信。

## 8. 测试策略

- 装配器、降级规则、持久化：纯单测，无需 Electron。
- 富内容 renderer：每个 MIME 类型一个契约测试（合法输入渲染、恶意输入被清洗/拒绝）。
- e2e：两态切换、重启恢复、SSH 断线重连后视图状态保持；既有终端 e2e 套件（`tests/e2e/terminal-sftp-layout.spec.ts` 等）必须保持绿色。

## 9. 实现备注（P1+P2 落地，2026-08-30）

实际实现与原设计的三处具体化：

- **OSC 133 解析落在 renderer**：`CommandBlockAssembler`（`src/core/terminal/CommandBlocks.ts`）挂在 `TerminalPane.vue` 的数据入口，实时输出与恢复回放共用同一装配器；主进程输出链路零改动（规避 v1.4.4 时代的注入回归面）。
- **Shell 注入范围**：bash 系（git-bash/WSL）把 OSC 133 标记并入既有 `PROMPT_COMMAND` 环境变量注入（`TerminalService.ts` 的 `OSC133_BASH_INTEGRATION`，含 DEBUG trap 上报 base64 命令文本）；PowerShell 经启动参数注入 prompt 函数，只上报 A/D（无 preexec，整段成块）；**SSH 不注入**（遵守 v1.4.4 决定），cmd 无机制——这两类会话在 GUI 视图下降级为终端渲染并给出切回提示。
- **降级是渲染行为**：`TerminalPane` 的 `guiDegraded` 判定（ssh / cmd）下显示 xterm + 提示条，不引入第三个用户状态；`presentation` 仅持久化 `'gui'`，缺省即终端视图（存储格式保持 v3，无需迁移）。

## 10. 实现备注（P3 落地，2026-08-30）

- **私有序列定为 OSC 1338**：`ESC ] 1338 ; <mime> ; <base64> (BEL|ST)`。与 133 共用统一正则扫描；命令周期内（C 之后）归属当前命令块，周期外自成独立块。富内容负载的跨帧尾缓冲上限单列（`MAX_RICH_PAYLOAD_CHARS`，约 3MB 原始数据），超限整条丢弃。
- **白名单 MIME**：`text/plain`、`text/markdown`、`application/json`、`text/csv`、`image/png/jpeg/svg+xml`，在装配层过滤（`SUPPORTED_RICH_MIMES`），未列入的序列直接忽略。
- **renderer 零新依赖**：Markdown 为自实现安全子集（`MarkdownLite.ts`，先全文转义再变换，链接仅 http/https/mailto/相对地址）；CSV 为自实现解析（引号/换行/转义，`CsvLite.ts`）；JSON 为递归树组件（`TerminalJsonTree.vue`）；图片走 `data:` URL `<img>`（天然无脚本执行面）。
- **`nav-render <file> [mime]`**：bash 系并入 `OSC133_BASH_INTEGRATION`（PROMPT_COMMAND 环境变量注入），PowerShell 并入启动参数注入；按扩展名猜 MIME，可显式覆盖。SSH 远端不注入（同 P1），远端可自行把等价函数写进 `.bashrc`。
- **xterm 视图无感**：OSC 1338 对 xterm 是未知 OSC，直接被吞掉不显示，终端视图行为不变。

## 11. 实现备注（GUI 视图打磨落地，2026-08-30）

- **靠左对齐**：全局 `#app { text-align: center }` 会继承进 GUI 视图，导致块头命令、输出、Markdown 正文全部居中。修复与 xterm-host 同款：`.terminal-gui-view` 显式 `text-align: left`（空状态 hero 保留居中）。
- **深色终端配色**：终端画布 `--terminal-bg` 在两个主题下均为深色，原先白色卡片 + 浅色文字在深色输出井上对比错乱。命令块/输出/富内容全部改为 `--terminal-fg` 透明度混合的深色派生色，与 xterm 视觉一致。
- **输入交互**：GUI 视图底部固定输入行（`.gui-input`），回车经 `terminal-session-write` 写 `text + '\r'`（复用「重新运行」的写入门控）；IME 组词中的回车不提交（`event.isComposing`）；↑/↓ 翻阅会话内输入历史（内存数组，上限 100 条，不持久化）。全局终端快捷键处理器本就跳过 input/textarea，输入框不会抢占快捷键。
- **进行中块实时可见**：`getBlocks()` 原先只返回已完结块，`git log`（less 分页器）、`tail -f` 等长运行命令在收到 D 前完全不可见。现在列表末尾附带仍在进行的块（`finishedAt` 为空、输出随数据帧增长）；空闲提示符（pending）不入列，避免幻影块。
- **printf 幻影块修复**：bash 注入的 DEBUG trap 过滤器只排除 `__nav133_fire*` / `*__nav_e*`；空回车/Ctrl+C 不消耗 trap，导致 PROMPT_COMMAND 里的 OSC7 `printf` 与 `trap` 语句被当成用户命令上报为 C 标记。修复：PROMPT_COMMAND 第二条直接写 `trap - DEBUG` 显式摘除（实测 bash 中包成函数调用不生效），过滤器补 `"trap "*` 模式放行该语句；`__nav_e=$?` 保持最先执行以捕获真实退出码。
- **标记注入用户文件修复（同日跟进）**：C 标记原先 printf 到 stdout，用户命令带重定向时（`echo x > f`、`for ... done > f`）标记被吞进目标文件——终端收不到 C，GUI 显示「(command not captured)」，文件被 OSC 控制字节污染（less 报 binary）；且 for/while 循环体每条子命令都触发 DEBUG，一行命令发出 N 个 C。修复：① 首个提示符 `exec {__nav133_fd}>&1` 保存终端 fd，C 标记一律写 `>&$__nav133_fd`，任何用户重定向都截获不到；② `__nav133_emit` 标志保证每条命令行只发一次 C，PROMPT_COMMAND 末尾重新置位（必须是最后一条语句，否则其后的语句会以 emit=1 触发 trap 产生幻影块）；③ 删除 handler 内无效的 `trap - DEBUG`（函数包裹下不生效，此前注释已述）。WSL pty 与 MSYS2 bash 双侧验证：标记序列逐命令正确、重定向文件零 ESC 字节、空回车/Ctrl+C 无幻影、`false` 退出码正确。
- **白色轨迹排查结论**：用户截图中散布的细小白斑经像素分析确认不在任何 DOM 卡片内，是 xterm canvas 切到 display:none 后合成器残留的陈旧瓦片（疑似 Electron frameless 窗口专有，纯 Chromium 同流程无残留）。其字节流根源疑似就是上述注入 bug——被污染的流让 less 以 binary 模式渲染整屏乱码斜线。注入修复后，在真实 Electron 应用内按原场景（for 循环写文件 → less 全屏斜线 → q → 切 GUI，200ms/900ms/2400ms 三连截图 + 孤立亮点像素扫描）未再复现。若用户端仍偶发，请其滚动或缩放窗口后观察痕迹是否消失以确认合成器残留，再考虑切换时强制重绘的加固。
- **ls 列对齐修复**：ConPTY 重绘优化把连续空格压缩成光标序列，直接 strip 导致列塌陷。`normalizeTerminalLayout()` 按字符流解释：CUF(`\x1b[nC`)/CHA/HPA/CUP 还原为空格与换行（CUP/CHA 目标列小于当前列时换行再填充）、tab 展开到 8 列、宽字符（CJK/全角/emoji 代理对）按 2 列计、其余序列剥离。注意 ECH(`\x1b[nX`)**只擦除不移动光标**——擦除区由随后的 CUF 跳过补齐或被后续文本覆盖，按无操作处理（最初误当作空格发射，列宽翻倍）。GUI 的 displayOutput（含复制）统一走该函数。
- **cwd 呈现**：assembler 新增解析 OSC 7(`file://host/path`，bash 注入每个提示符上报)与 ConPTY OSC 9;9(Windows 路径)，`/home/<user>` 前缀压缩为 `~`，格式 `host:path`；块在 C 时刻盖章 `block.cwd`（语义=命令开始执行时所在目录），GUI 块头 meta 区与底部输入行（当前目录=下一条命令的执行目录）同时展示。注意注入脚本里 `printf D;A` 先于 OSC7，故 cwd 更新发生在 A 之后、下一条命令的 C 之前，盖章时序天然正确。
- **空幻影块根治**：周期关闭时 pending 的空白判定从 `pending.trim()` 改为 `normalizeTerminalLayout(pending).trim()`——ConPTY 提示符行重绘（纯转义序列、零可见文本）不再产生内容全空的「(未捕获命令)」块。真机验证：会话启动横幅块与 cd&&ls 后的空块均消失，ls 列对齐、块 cwd 与输入行 cwd 均正确。
- **进度条同行重写修复（同日三进）**：`normalizeTerminalLayout` 从「追加字符串」重构为「行单元」模型——每行是字符数组，`\r` 回列 0 后新文本**覆盖**旧文本（无 EL 时较短重写保留旧行尾部，与真实终端一致）；CUP 跟踪绝对行号，同行号重写当前行、异行号提交并开新行；ECH 原位擦除、EL 按参数清行；CUF 只移列、落字时才补空格。效果目标从「版面空白还原」升级为「终端最终屏幕的忠实文本快照」：apt/dpkg 的 `\r` 进度重写（ConPTY 原样透传 CR，已实测捕获）只保留每行最终状态，不再出现 `Reading package lists... 0%Reading package lists... Done` 式粘连。真实 `apt-get download` 捕获验证：进度帧全部收敛，输出与终端最终屏幕一致。
- **屏幕行号映射 + 折行续写（同日四进，真实 `sudo apt-get install` 仍乱后的根治）**：行单元模型对两类 ConPTY 翻译仍失效，遂重构为「转录行 + 屏幕行号映射」模型（`normalizeTerminalLayout(data, cols)`）：`lines` 为转录行数组，`rowToLine` 记录绝对屏幕行号 → 转录行下标。① dpkg 进度帧：dpkg 发 `\x1b[s\x1b[24;1H...\x1b[u`，ConPTY 翻译成 `CUP(24;1)进度文本\x1b[K CUP(10;1)` 循环对——CUP 落到已映射行号时**跳回该行原址重写**（靠覆盖 + EL 收敛为最后一帧），不再逐帧摊开；② 延迟折行续写：滚动状态下占满整行的长行（如 109 字符的 `Get:1`）被 ConPTY 分帧为首帧 80 字符 + `\r\n` + `CUP(下一行;80) 续写余下片段`，续写首字符与末列字符相同——`colParam === cols` 且当前无打开行时接回上一行、落笔在续写列（1 基转 0 基），同字符原位覆盖不再撕裂为 `1.` + 79 空格 + `.10.0-...`；③ 输出阶段把 ≥2 连续空行收敛为一行（dpkg 清行痕迹）。`cols` 由 TerminalPane 在 `fitTerminal()`/open 后从 xterm 同步并经 prop 传入 GUI。真实捕获回归：`tmp/pty-{wrap,dpkg,apt}-raw.bin` 归一化后与终端最终屏幕逐字一致；单测覆盖折行续写与 dpkg 帧收敛（用例注释含真实捕获结构）。已知边界：less/vim 的 alternate-screen 帧在同模型下同屏帧互相覆盖只剩最后一帧（用户已知独立问题，如需再按 `?1049` 单开处理）。
