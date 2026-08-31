# GUI 形态终端生态延续调研（第三轮）

> 目的：继续回答「有没有更贴近我想要的 GUI 形态交互终端工具」。
> 前两轮的结论见 `research-notes.md`（路线选择）与 `wave-notes.md`（Wave 对比），
> cmux 对比见 `cmux-notes.md`。
> 调研时间：2026-08-30。所有项目状态均通过 GitHub API / 官方资料当日核实，
> 不依赖记忆——项目活跃度变化很快。

## 0. 一句话结论

**可嵌入的 GUI/块式终端库仍然不存在，自建是唯一路径**（第三轮确认）。
但本轮出现三个新变量：**Warp 开源**、**libghostty-vt 可嵌入**、**Zellij 给出
「终端内 GUI 交互」的最小接口集**。

---

## 1. Warp 已开源（本轮最重要发现）

| 项 | 值（2026-08-30 核实） |
|---|---|
| 仓库 | `warpdotdev/warp` |
| License | **AGPL-3.0**（仓库同时含 `LICENSE-AGPL` 与 `LICENSE-MIT`，需逐 crate 核对；默认按 AGPL 处理） |
| Stars | 64,656 |
| 活跃度 | 当日仍提交 |
| 默认分支 | `master`（注意不是 `main`，raw 取文件路径时会 404） |
| 平台 | macOS / Linux / **Windows**（`script/windows/` 有完整打包脚本） |
| 语言 | Rust |

结构：`crates/`（可复用 crate）、`app/`（应用本体）、`command-signatures-v2/`
（命令签名数据）、`specs/`（设计规范）、`agents/`、`resources/`。

### 1.1 真正的价值在 `specs/`，不在代码

仓库根目录有 **几百篇 `PRODUCT.md` / `TECH.md`** 设计规范，是业界唯一公开的
块式终端设计档案。已确认存在的主题（节选）：

- 块内富文本渲染：`specs/zachlloyd/inline-markdown-images-in-blocklist/`、
  `markdown-table-consistency/`、`wide-markdown-table-scrolling/`
- 输出重绘与视口：`specs/tui-output-redraw/`、`specs/tui-viewport/`、
  `specs/tui-transcript-view/`
- 交互式程序与块的共存：`specs/CODE-1827/BLOCKING_INTERACTIONS_TECH.md`
- 抽象层：`specs/terminal-manager-view-abstraction/TECH.md`
- 其它：`specs/tui-ctrl-c/`、`specs/tui-input-view/`、`specs/tui-editor-element/`

**建议动作**：只读思路与边界情况清单，**不动一行代码**（AGPL 对 MIT 项目是红线）。

### 1.2 补充：命令签名数据

`command-signatures-v2/` 值得单独看一眼——若它需要覆盖命令的参数语义，
可作为 withfig 之外的补全数据源参考。

---

## 2. libghostty-vt：唯一真正可嵌入的新东西

`ghostty-org/ghostty`，**MIT**，60k star，Zig。

- `libghostty-vt` 已支持 macOS / Linux / **Windows / WebAssembly**，
  定位是「VT 序列解析 + 维护终端状态」，SIMD 解析、模糊测试过的解析器，
  已能解析 Kitty 图形协议与 tmux control mode。
- 参考实现见 `ghostty-org/ghostling`。

**判断**：它是 VT 解析器，**不是块模型**——解决不了我们的问题。对我们只有两个用法：

1. 当**差分测试基准**：验证我们 OSC/ANSI 解析器（`CommandBlocks.ts` 的
   `MARKER_PATTERN` 与 `normalizeTerminalLayout`）的正确性，比继续靠猜 ConPTY 癖好强。
2. 将来若要支持 Kitty 图形协议，优先复用它的解析结果，别自己写。

---

## 3. 终端「GUI 化」的最小接口集：Zellij

`zellij-org/zellij`，**MIT**，35k star，**v0.44.0（2026-03-23）起原生支持 Windows**。

v0.44.0 一次性给了三样东西（官方公告：
<https://zellij.dev/news/remote-sessions-windows-cli/>）：

- `zellij subscribe`：实时订阅任意 pane 的 viewport + scrollback 更新流
- `zellij action list-panes` / `dump-screen`：pane 列表带 ID/标题/运行命令/坐标，
  viewport 可带 ANSI 颜色导出
- **Plugin API（WASM，已从 wasmtime 迁到 wasmi）**：插件可读取其它 pane 的
  scrollback（含 ANSI 样式）、**高亮 viewport 任意文本并接收 Alt+Click 事件**

**这是目前唯一被主流产品验证过的「终端内 GUI 交互」最小接口集：**
`读回看（scrollback）+ 高亮 + 点击回调`。我们的块视图可以直接照这个形状补交互。

注意：Zellij 是完整 Rust app，不可嵌入；且 0.44 才刚建立 protobuf 客户端/服务端契约，
之前每个版本升级都会让旧 session 失效——**别当依赖，只当接口参考**。

---

## 4. 富内容协议：Windows 上哪些真能用

| 协议 / 序列 | Windows Terminal | xterm.js | 对我们的建议 |
|---|---|---|---|
| **OSC 8 超链接** `OSC 8 ; ; URI ST` | ✅ | ✅ `@xterm/addon-web-links` | 直接采用 |
| **OSC 9;4 进度条**（ConEmu） | ✅ 官方支持 | 需自己解析 | **建议加**：块内进度显示，正好补 apt/dpkg 类痛点 |
| **OSC 9;9 / OSC 7**（cwd） | ✅ 9;9 | 需自己解析 | 已实现（`CommandBlocks.ts`） |
| **OSC 9 / OSC 777 通知** | ✅ | 需自己解析 | **我们空白** → 见 `cmux-notes.md` §1 |
| **iTerm2 内联图** `OSC 1337;File=inline=1:<b64>` | ❌ | ✅ `@xterm/addon-image` | 富内容块可扩 |
| **Sixel** `DCS q … ST` | ✅（1.22+） | ✅ addon-image | 唯一 WT 与 xterm.js 都支持的图像协议 |
| **CSI ?2026 同步输出** | ✅ | 待自测（5.4+ 声称支持） | 防大块输出闪烁，值得加 |
| Kitty 键盘协议 | ✅（已合并 canary） | ❌ | 对 vim/htop 类 TUI 有提升，中优先级 |
| **Kitty 图形协议** | ❌ | ❌ | Windows 上无人支持 |
| **iTerm2 marks / annotations / 状态栏 / badge** | ❌ | ❌ | macOS 专有、无 JS 渲染器，死胡同 |

补充事实：ConPTY 会**原样透传**应用发出的转义序列（sixel 在 Windows Terminal 下可工作），
但 ConPTY 不提供任何 per-command 信息——所以 shell integration 这条路没有替代品。

---

## 5. 明确排除

- **tmux 控制模式**（`tmux -C`）：结构化程度被高估。`%begin/%end` 只包裹命令输出边界，
  `%output %<pane-id>` 是**八进制转义后的原始字节流，不是带样式的网格**；
  元数据要靠 `list-panes -F '#{pane_current_path} #{pane_current_command}'`，
  格式订阅最快 1 次/秒；内容要 `capture-pane -e` 才带样式。
  **它帮你编排窗格/会话树，不帮你做终端仿真**（iTerm2 是把每个 pane 灌进自己的仿真器
  再渲染成原生视图）。且 **tmux 无原生 Windows 版**，只对 WSL 会话有效，
  Git Bash / PowerShell 用不上。JS 客户端生态基本是空的。
- **Kitty**：GPL-3.0（对 MIT 项目有传染风险）+ **全平台唯独没有 Windows**。
  `kitty @` remote control 与 kittens 只能当设计参考。
- **Nushell**（MIT，40k，Windows 原生，活跃）：结构化数据**只存在于管道内部**，
  写到终端时已被渲染成文本；且不兼容 bash 语法，对 ssh / apt / make / 厂商脚本是倒退。
  唯一价值：`nu --ide-complete / --ide-hover / --ide-goto-def` 这套 IDE 协议
  可作为 withfig 之外的高质量补全数据源。
- **WezTerm**：mux 模型（pane 是可寻址对象、`wezterm cli list/get-text/send-text`、
  Lua `wezterm.mux` API、Windows 原生）概念很好，但 mux RPC 是**未公开的私有协议**，
  要用就得整个带上 WezTerm 二进制。
- **Elvish**：2026-03 后停滞，Windows 非官方支持。
- **TUIOS**（Go 终端复用器+窗口管理器）、**OpenTUI / Ink / Bubble Tea / Textual /
  Ratatui**：都是「写 TUI 应用」的框架（渲染到终端网格），方向与需求相反。
- **SEO 垃圾警告**：`opaopa6969/ptylenz`、`nhatphatt/Termineo`（均 0 star、
  无 license 或已停更）——典型 AI 生成的关键词农场，别浪费时间。

---

## 6. 直接回答「我想要的东西存在吗」

**不存在。** 证据链：

1. **xterm.js（21k star）是唯一事实标准，但它只提供「字符网格 + 渲染」**。
   OSC 133 的块语义、OSC 8 链接、进度、图像——全部留给宿主应用自己实现。
   它不是 block 库，也不打算是。
2. **VS Code 的 shell integration 是协议 + 自家实现，从未独立成库**。
3. **所有带块的产品都是完整 app**：Warp（Rust/AGPL）、Wave（Go）、
   Extraterm、Zellij（Rust）。没有一家把块层抽成库。
4. **唯一新出现的可嵌入件是 libghostty-vt**，而它明确只是解析器。

**结论：块模型 = 应用层协议（OSC 133/633 + 自定义载荷）+ 宿主渲染。这一层业界
没有共识，也没有共享库，每个产品各写各的。** 我们的 OSC 1338 设计方向正确，
且比多数同类更「协议化」（MIME 载荷通道）。

---

## 7. 收敛后的三条路线

| 路线 | 内容 | 成本 | 对症程度 |
|---|---|---|---|
| A. 块富化 | OSC 8 / 9;4 进度 / 图像 / ?2026；砍掉 `normalizeTerminalLayout` | 中 | 中——天花板明确 |
| B. 零命令入口 | Wave widgets + cmux custom commands（两个独立项目收敛到同一答案） | 低 | **高** |
| C. 注意力/通知 | OSC 9/777 + pane 环 + 通知中心（cmux 核心，我们空白） | **低** | **高** |

**下一步的取舍见 `../04-design.md`**（用户提出的「ls → 文件树、
cat → Markdown」形态分析，属于路线 A 的真正形态）。
