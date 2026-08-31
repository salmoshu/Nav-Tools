# cmux 借鉴点调研

> 目的：回答「cmux 有哪些可以借鉴」。面向 Nav-Tools v1.5.0 终端 GUI 块视图
> （设计见 `../03-implementation.md`；Wave 对比见 `wave-notes.md`）。
> 基线：`manaflow-ai/cmux` @ `4327ceb021`（2026-08-30，26.6k star，Swift）。
> 方法：GitHub API 取文件树后按需抓取关键源码与 docs（网络不稳，完整 tarball 反复截断），
> 已抓到的文件镜像在 `tmp/cmux-mirror/`，文件树在 `tmp/cmux-tree.json`。

## 0. 前提：许可证与平台决定了「只能抄想法」

| | cmux | Nav-Tools |
|---|---|---|
| 平台 | **仅 macOS**（Swift + AppKit） | Windows（Electron） |
| 终端引擎 | `libghostty`（GPU） | xterm.js + node-pty |
| 许可证 | **GPL-3.0-or-later**（GitHub API 报 NOASSERTION，README/FAQ 明确 GPL-3.0-or-later，另提供商业授权） | **MIT** |

两个结论：

1. **代码一行都不能复制**——GPL-3.0 对 MIT 项目是红线；AppKit/Swift 也无法搬到 Electron。
2. 值得抄的是**交互模型**：尤其是「注意力/通知」这一整套，我们目前完全空白。

## 1. 最值得抄：注意力 / 通知系统（我们当前是空白）

### 1.1 现状对比

Nav-Tools 的 `MARKER_PATTERN`（`src/core/terminal/CommandBlocks.ts:63`）覆盖
OSC 133 / OSC 1338 / OSC 7 / OSC 9;9（ConPTY cwd），**没有 OSC 9、OSC 99、OSC 777**，
也没有任何 pane 级「需要关注」状态或通知中心（全仓 grep 无 notification/notify 基础设施）。

对 Nav-Tools 的场景这是**真实的缺口**：交叉编译、部署、抓日志这类命令动辄几分钟，
用户不会盯着那个窗格；当前只能靠自己切过去看。

### 1.2 cmux 的三层结构

```text
来源层  OSC 9 / 99 / 777（程序主动发）  +  `cmux notify` CLI  +  agent hooks
          ↓
状态层  TerminalNotification（一条通知）+ SurfaceAttentionModel（哪些 surface 需要关注）
          ↓
呈现层  pane 蓝环闪烁 + 侧栏徽标 + 通知面板（⌘⇧U 跳到最近未读）+ 系统通知
```

- **通知模型** `Sources/TerminalNotification.swift:4-19`：
  `id / tabId / surfaceId / panelId / title / subtitle / body / createdAt / isRead /
  paneFlash / scrollPosition / clickAction`。注意 `scrollPosition`——**通知能记住发出时的
  滚动位置**，点击后回到当时的上下文。
- **注意力状态** `Packages/macOS/CmuxNotifications/Sources/CmuxNotifications/SurfaceAttentionModel.swift:7-53`：
  本质就是 **一个可观察的 `Set<UUID>`**（哪些 pane 需要关注）+ `setAttention(_:forSurface:)`。
  这个状态与「通知列表」分离：通知是历史，attention 是当前待处理的集合。
- **呈现** `Sources/Panels/WorkspaceAttentionFlashRingView.swift`（窗格蓝环）、
  `Sources/Workspace+AttentionFlashRouting.swift`（路由到哪个窗格闪）。

### 1.3 落地到 Nav-Tools 的形状（改动小）

1. `MARKER_PATTERN` 增加两组：
   - `ESC ] 9 ; <body> BEL|ST`（iTerm2 growl 风格，**无标题**）
   - `ESC ] 777 ; notify ; <title> ; <body> BEL|ST`（rxvt-unicode / wezterm 风格）
   - 可选 `OSC 99 ; ...`（iTerm2 富通知）
2. 新增 pane 级 `attention` 状态（reactive `Set<paneId>`，Vue 里一个 `ref(new Set())` 即可）。
3. 呈现：窗格边框高亮/呼吸动画 + 终端组件标题栏徽标 + 一个统一的通知面板，
   点击跳转到对应 pane（并可保存 `scrollPosition`）。
4. 额外给一个 **CLI/脚本入口**（对标 `cmux notify`）：让构建脚本能主动上报
   `nav-notify "编译完成"` / 失败。比等用户解析输出可靠得多。

### 1.4 解析器的工程细节（照抄设计，别照抄代码）

`Sources/RemoteTmuxNotificationOSCFilter.swift:30-68` 是一个**跨数据帧的有状态解析器**，
注释里写清了四类必须处理的事：

- `%output` 这类数据块可以在**任意字节处切开**序列，所以要有 `text / esc / collect /
  collectEsc / passOsc / passOscEsc` 六态机；
- 非通知序列必须**原样透传**（标题、超链接、剪贴板、OSC 777 的非 `notify` 子命令），
  一旦负载偏离前缀就把缓冲原样吐出并恢复直通；
- 未完成的候选序列超过 `maxBufferedBytes = 4096` 就放弃匹配、原样透传——
  **恶意或损坏的流不能钉住内存、也不能吞掉输出**；
- 热路径优化：`state == .text` 且块内无 `0x1b` 时直接返回。

我们现有的 `feed()` 已经做了 OSC 跨帧尾缓冲（`CommandBlocks.ts:350-361`），
只需把同样的「有界 + 原样透传」约束套到新的 OSC 9/777 上。

> 另一个细节：cmux 自己**不解析**主流路径的 OSC 通知——那是 Ghostty 的
> `desktop_notification` 回调干的事（终端模拟器负责，宿主只收结果）；
> 上面的过滤器只在「tmux 镜像窗格没有本地 TTY」这一个特例存在。
> **再次印证「不为 GUI 重造终端」的判断**：能交给 xterm.js/Ghostty 的转义解析，就别自己做。

## 2. 侧栏元信息 + 用户自定义侧栏

- 侧栏每个 workspace 显示：git 分支、关联 PR 状态/编号、工作目录、监听端口、最近一条通知文本。
  元信息由程序/插件上报（如 `ControlSidebarGitBranchInfo.swift` 负责分支信息）。
  → 对 Nav-Tools：pane 头部/侧栏可显示 host、cwd、当前运行命令、退出码、监听端口，
  这些我们部分已有（cwd、exitCode），缺的是端口与「最近一条通知」。
- **用户自定义侧栏**（`docs/custom-sidebars.md`）：在 `~/.config/cmux/sidebars/<name>.swift`
  写一个 SwiftUI 风格视图表达式，运行时解释执行、保存即热重载、可绑定实时状态
  （`workspaces` 上下文）、点击执行 `cmux(...)` 动作；也有 `<name>.json` 声明式简化版。
  官方示例：`Examples/CustomSidebars/status-board.swift`、
  `Examples/CmuxExtensionSidebarExamples/.../DevServerSidebar.swift`、
  `.../LastPromptSidebar.swift`、`.../AttentionQueueSidebar.swift`。
  → 对 Nav-Tools：这是 Wave widgets 思路的**升级版**——widgets 是内置固定项，
  自定义侧栏是**用户可编写的面板**。若做「预设任务面板」，值得一步到位设计成
  「内置预设 + 用户可声明式扩展（JSON）」。

## 3. 自定义命令 + 命令面板（与 Wave widgets 同一方向）

项目级 `cmux.json` 里定义 custom commands，从命令面板唤起。
→ 与 `wave-notes.md` §2 的 widgets 是同一结论：**给零命令入口**。
两个独立项目都收敛到这个答案，说明它比继续打磨终端呈现更对症。

## 4. CLI + Unix socket API（可自动化）

`docs/cli-contract.md`（58KB）+ `Packages/macOS/CmuxControlSocket/`：
建 workspace、分屏、发按键、读屏幕内容、截图、驱动浏览器，全部可脚本化；
通知也有 V2 socket verb（见 `docs/feed.md:27`）。
→ 对 Nav-Tools：已有 IPC，可考虑暴露一个外部 CLI/命名管道入口，
让 CI 或本地脚本触发「在指定窗格执行一条命令」，与 §3 的任务面板共用一套动词。

## 5. 会话恢复

退出时保存窗口/workspace/pane 布局、工作目录、终端回滚（best effort）、浏览器 URL/历史，
写在 `~/Library/Application Support/cmux/` 的版本化快照里；
重启后**先重建布局**，再按需执行 resume 命令；明确不做进程状态 checkpoint。

→ 对 Nav-Tools：我们已经持久化布局与 `presentation`；可以补的是
「回滚内容恢复」与「重启后自动恢复工作目录/重连会话」——对 SSH 窗格体验提升明显。

## 6. 产品哲学：primitive, not a solution

README 明确：cmux 只提供 terminal + browser + notifications + workspaces + splits +
tabs + CLI，**不规定工作流**（"a primitive, not a solution"），刻意不做 agent 编排。

→ 对 Nav-Tools 的启发：GUI 化的落点应是「能力」（通知、任务面板、富内容渲染、
跳转），而不是替用户决定流程。这与用户「不要接 AI 助手、只做终端富文本化」的取向一致。

## 7. 跳过清单

- **Feed**（`docs/feed.md`）：把 agent 的 PermissionRequest / ExitPlanMode /
  AskUserQuestion 变成可点击卡片。整套围绕 AI agent 会话，**用户已明确排除 AI 集成**，跳过。
  唯一可借的是「hook 阻塞在信号量上等用户决策、超时 120s 后放行」这个软等待模型。
- **内置浏览器面板 + agent-browser 脚本 API**（`docs/agent-browser-port-spec.md`）：
  与嵌入式上位机场景无关。
- **claude-teams / agent hooks 矩阵 / iOS 伴侣 App / Cloud VM / iroh relay**：
  绑定 macOS + AI agent 生态。
- **Ghostty 配置兼容、GPU 渲染**：平台不可迁移。

## 8. 引用索引

已镜像到 `tmp/cmux-mirror/`：

- `Sources/TerminalNotification.swift` 通知模型（含 scrollPosition / clickAction）
- `Sources/TerminalNotificationPolicy.swift` 投递策略（36KB，未通读）
- `Sources/Workspace+AttentionFlashRouting.swift` 注意力 → 窗格闪烁路由
- `Sources/Panels/WorkspaceAttentionFlashRingView.swift` 窗格蓝环视图
- `Sources/RemoteTmuxNotificationOSCFilter.swift` **OSC 9 / 777 有状态解析器（重点）**
- `Packages/macOS/CmuxNotifications/.../SurfaceAttentionModel.swift` 注意力集合模型
- `Packages/Shared/CmuxAgentChat/.../OSC133CommandParser.swift` 其 OSC 133 解析（供对照）
- `docs/custom-sidebars.md` 用户自定义侧栏契约
- `docs/configuration.md`、`docs/cli-contract.md`、`docs/events.md`、`docs/feed.md`
- `Examples/CustomSidebars/status-board.swift`、
  `Examples/CmuxExtensionSidebarExamples/.../{DevServer,LastPrompt,AttentionQueue}Sidebar.swift`

未抓取但值得再看：`Packages/macOS/CmuxControlSocket/Sources/CmuxControlSocket/Coordinator/**`
（socket 动词全集）、`docs/data-driven-sidebar-plan.md`、`docs/canvas-layout-design.md`。
