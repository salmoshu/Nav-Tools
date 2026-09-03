# 项目调研汇总（横向结论）

> 本文只放**横向结论**。原始底稿（含 `path:line` 引用、逐项评估）在 `research/`：
>
> | 底稿 | 内容 |
> |---|---|
> | `research/research-notes.md` | 第一轮：路线选择（增强 xterm / DOM 终端 / 结构化事件+富内容块）、协议与产品盘点 |
> | `research/wave-notes.md` | 第二轮：Wave Terminal 源码级对比（后端 PTY 管线、前端块模型、widgets、补全） |
> | `research/cmux-notes.md` | 第三轮：cmux 对比（注意力/通知系统、自定义侧栏、CLI/socket、会话恢复） |
> | `research/survey-notes.md` | 第四轮：生态延续调研（Warp 开源、libghostty-vt、Zellij、富内容协议清单） |
> | [`research/warp-command-completion.md`](research/warp-command-completion.md) | Warp 官方命令提示/补全交互与源码行为；提炼 Nav-Tools 最小切片 |

所有项目状态均于 **2026-08-30 经 GitHub API 核实**，不依赖记忆。

## 1. 一句话结论

**可嵌入的 GUI / 块式终端库不存在。块模型是应用层协议（OSC 133/633 + 自定义载荷）
+ 宿主渲染，业界既无共识也无共享库，每个产品各写各的。**

四轮调研（每轮换措辞搜索）没有发现任何例外。这意味着：
**我们不是"没找到轮子"，而是这个轮子确实没人造过。**

## 2. 全景表

| 项目 | License | Stars | 最近提交 | Windows | 可嵌入 | 形态 | 对我们的价值 |
|---|---|---|---|---|---|---|---|
| **Warp**（`warpdotdev/warp`） | **AGPL-3.0**（另有 LICENSE-MIT，需逐 crate 核对） | 64.7k | 2026-08-30 | ✅ | ❌ Rust app | 块式终端 | **只读 `specs/`**（几百篇设计规范），不动代码 |
| **Wave Terminal** | Apache-2.0 | 22.2k | 2026-08-11 | ✅ | ❌ Go+React app | 会话块 + 富内容块 | 架构参考（不重造终端）+ widgets 思路 |
| **cmux** | **GPL-3.0-or-later** | 26.6k | 2026-08-30 | ❌ 仅 macOS | ❌ Swift/AppKit | 真终端 + 通知 | **注意力/通知系统**（我们空白） |
| **Zellij** | MIT | 35.2k | 2026-08-28 | ✅ 0.44+ | ❌ Rust app | TUI 复用器 | 「终端内 GUI 交互」最小接口集 |
| **libghostty-vt** | **MIT** | 60.5k | 2026-08-30 | ✅ + WASM | **✅** | VT 解析器 | **唯一可嵌入件**；当差分测试基准 |
| **xterm.js** | MIT | 21.1k | 2026-08-28 | ✅ | **✅**（已在用） | 字符网格 | 事实标准；块语义留给宿主 |
| **Extraterm** | MIT | 2.8k | 2026-06-05 | ✅ | ❌ | 块（frame）式终端先驱 | 理念参考，活跃度低 |
| **Nushell** | MIT | 40.4k | 2026-08-30 | ✅ | ❌ shell | 结构化数据 shell | 仅 `--ide-complete` 可作补全数据源 |
| **tmux** | ISC | 48.9k | 2026-08-28 | ❌ 仅 WSL | ❌ | 复用器 | `-C` 控制模式帮编排、**不帮终端仿真** |
| **WezTerm** | MIT（仓库标 NOASSERTION） | ~28.6k | 活跃 | ✅ | ❌ | GPU 终端 + mux | mux RPC 私有，要带二进制 |
| **Kitty** | **GPL-3.0** | 34.7k | 2026-08-30 | ❌ **无 Windows** | ❌ | GPU 终端 | 排除（GPL + 无 Windows） |
| **DomTerm** | NOASSERTION | ~0.4k | 活跃 | ✅ | ❌ | DOM/HTML 终端 | 单人维护 + 许可证存疑 |

## 3. 四条收敛结论

### 3.1 不为 GUI 重造终端（本轮最强共识）

| 证据 | 出处 |
|---|---|
| Wave 后端把 PTY 裸字节直接落盘，**零解析、零 ANSI 处理** | `research/wave-notes.md` §1.1 |
| Wave 全 `pkg/` 无任何 Go 侧终端模拟器 | 同上 |
| cmux 的 OSC 通知由 **Ghostty 的 `desktop_notification` 回调**解析，宿主只收结果；自己写的解析器只用于「没有本地 TTY 的 tmux 镜像」这一个特例 | `research/cmux-notes.md` §1.4 |
| Warp / Wave **都保留一个真终端作为底层，块只是呈现层** | `research/research-notes.md` |

→ 直接印证「砍掉 `normalizeTerminalLayout`、改从 xterm buffer 派生」的判断。

### 3.2 块模型没有共享库

xterm.js 只提供字符网格 + 渲染，块语义留给宿主；VS Code 的 shell integration
是协议 + 自家实现，从未独立成库；Warp / Wave / Extraterm / Zellij 都是完整 app。
**唯一可嵌入的新东西是 libghostty-vt，而它明确只是解析器。**

### 3.3 零命令入口（两个独立项目收敛到同一答案）

- Wave：`pkg/wconfig/defaultconfig/widgets.json`（JSON 数组定义按钮 → 打开 terminal/files/web/sysinfo/processes）
- cmux：项目级 `cmux.json` 自定义命令 + 命令面板；更进一步有**用户可编写的自定义侧栏**
  （`~/.config/cmux/sidebars/<name>.swift`，运行时解释、热重载、可绑定实时状态）

→ 对「终端对用户不友好」这个原始诉求，这两家的答案都不是"让终端更富文本"，
而是**给不用敲命令的入口**。

### 3.4 注意力/通知是被忽视的低成本高收益项

cmux 整套核心就是这个：**OSC 9 / 99 / 777 + `cmux notify` CLI + hooks** →
pane 蓝环 + 侧栏徽标 + 通知面板 + 跳转未读。
我们目前 `MARKER_PATTERN` 不覆盖 OSC 9 / 777，全仓无通知基础设施（**空白**）。
详见 `research/cmux-notes.md` §1。

### 3.5 Warp 的输入辅助是三个独立状态

Warp 明确分开：单条灰字 **autosuggestion**、`Tab` **completion menu**、
`↑` / `Ctrl+R` **history**。对我们最划算的落地方式是：GUI 输入行用
会话历史做灰字整行建议，Tab 菜单只放命令规格 + 当前会话路径，
xterm 视图不拦截按键、继续使用 Shell 原生补全。排序保持「完全匹配 → 前缀 →
模糊」；菜单初始不预选，避免 `Enter` 误接受第一项。行为证据、键位、
Shell/SSH 边界与 AGPL 源码禁复制说明见
[`research/warp-command-completion.md`](research/warp-command-completion.md)。

## 4. 可抄清单（按性价比）

| 项 | 来源 | 成本 | 说明 |
|---|---|---|---|
| **注意力/通知（OSC 9 / 777 + pane 徽标 + 通知中心）** | cmux | 低 | 我们空白；对长耗时命令体感提升最大 |
| **Widgets / 预设任务面板** | Wave + cmux | 低 | 两个项目共同收敛的方向 |
| **OSC 9;4 进度条** | 协议 | 低 | 直接补 apt/dpkg 类块内进度 |
| **OSC 8 超链接** | 协议 | 低 | xterm.js 有官方 addon |
| **WPS 增量 append 协议形状**（FileOp_Append + scope + version） | Wave | 中 | 替换我们整块重发 |
| **wconfig 扁平命名空间键 + 级联覆盖 + `[conn]` 子 map** | Wave | 中 | 若要做 per-connection 配置 |
| **Zellij 的「读回看 + 文本高亮 + Alt+Click 回调」** | Zellij | 中 | 唯一被验证过的终端内 GUI 交互接口集 |
| **OSC 16162 的 `R` 命令**（强制退出备用缓冲，自愈卡屏） | Wave | 低 | vim/less 崩溃后的恢复 |
| **会话恢复**（布局 + cwd + 回滚，重启后重连） | cmux | 中 | 对 SSH 窗格体验提升明显 |
| **补全交互**（灰字建议 + Tab 菜单 + 独立历史） | Warp；Wave 的 reqnum | 中 | 先用内置规格 + 会话路径/历史；不复制 Warp AGPL 代码 |

## 5. 不要抄清单

- **TileLayout 布局引擎**（Wave，3600 行 + 后端往返）——只抄 magnify / ephemeral / 键盘导航
- **wsh companion binary + OSC 23198 RPC**（Wave）——依赖 Go 交叉编译与多架构分发；
  只在需要**双向查询**时才考虑
- **vdom / tsunami**（Wave）——Go 写的 mini React / 终端内 GUI SDK，与我们无关
- **tmux 控制模式**——`%output` 是裸字节，不帮仿真；无原生 Windows 版
- **Kitty**——GPL + 无 Windows
- **iTerm2 marks / annotations / 状态栏 / badge**——macOS 专有，无 JS 渲染器
- **Wave 的 suggestion 数据源**——只有文件与书签，不如 withfig
- **Feed / agent hooks 矩阵**（cmux）——围绕 AI agent，我们已排除 AI
- **SEO 垃圾仓库**：`opaopa6969/ptylenz`、`nhatphatt/Termineo`（0 star、无 license、已停更）

## 6. 富内容协议速查（Windows 可用性）

| 协议 | Windows Terminal | xterm.js | 建议 |
|---|---|---|---|
| OSC 133 / 633 shell integration | 部分 | 自行解析 | 已在用 |
| OSC 8 超链接 | ✅ | ✅ addon | 采用 |
| **OSC 9;4 进度条** | ✅ | 自行解析 | 建议加 |
| OSC 7 / OSC 9;9（cwd） | ✅ | 自行解析 | 已实现 |
| **OSC 9 / 777 通知** | ✅ | 自行解析 | **我们空白** |
| iTerm2 内联图 / Sixel | Sixel ✅ | ✅ addon-image | 富内容块可扩 |
| CSI ?2026 同步输出 | ✅ | 待自测 | 防闪烁 |
| Kitty 图形协议 | ❌ | ❌ | Windows 死路 |
| iTerm2 marks / annotations | ❌ | ❌ | 死路 |

注：ConPTY **原样透传**应用发出的转义序列，但不提供任何 per-command 信息——
shell integration 没有替代品。

## 7. 收敛后的三条路线

| 路线 | 内容 | 成本 | 对症程度 |
|---|---|---|---|
| A. 块富化 | 嗅探 + 白名单富化；砍掉 `normalizeTerminalLayout` | 中 | 中（天花板明确，见 `01-requirements.md` §4） |
| B. 零命令入口 | widgets / 预设任务面板 | 低 | 高 |
| C. 注意力/通知 | OSC 9/777 + pane 徽标 + 通知中心 | 低 | 高 |

路线 A 的具体设计与实施顺序见 `04-design.md`。
