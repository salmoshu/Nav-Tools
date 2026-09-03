# Warp 命令提示与补全：最小可落地切片

> 调研日期：2026-09-03。仅使用 Warp 官方文档与官方仓库；源码引用固定在
> `4fa1a3c664a9cd7bea951d2c62d2815846fd3af1`。

## 结论

Warp 将输入辅助分成三个独立交互，Nav-Tools 也应保持这条边界：

| 交互 | Warp 行为 | Nav-Tools 最小实现 |
|---|---|---|
| **Autosuggestion** | 输入时显示单条灰字建议，来自 shell 历史或可能的补全；右箭头 / `Ctrl+F` 整条接受，也可按词部分接受。[官方文档](https://docs.warp.dev/terminal/command-completions/autosuggestions) | 只取当前会话中最近的「整行前缀匹配」作灰字；右箭头接受，不自动执行。 |
| **Completions** | `Tab` 打开命令、选项名、路径参数的候选菜单；支持模糊匹配、别名、动态候选（如 Git 分支）。[官方文档](https://docs.warp.dev/terminal/command-completions/completions) | 沿用内置高频命令规格，补上当前 `cwd` 文件/目录；先做前缀匹配，现有 `FuzzyMatch` 可在不增依赖的前提下再补近似候选。 |
| **History** | `↑` 按当前输入做历史前缀搜索；`Ctrl+R` 打开独立面板做模糊搜索。运行中各 shell 会话隔离，关闭后才合并。[官方文档](https://docs.warp.dev/terminal/entry/command-history) | 保留现有 `↑/↓` 和 `Ctrl+R`；首版继续会话内存历史，不做跨会话合并与持久化。 |

## 候选模型、排序与显示

Warp 当前源码的候选项分开 `display` 与 `replacement`，并携带描述、类型、优先级、隐藏状态及文件类型；类型包括命令、变量、参数、子命令和选项。[官方源码：候选模型](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/crates/warp_completer/src/completer/suggest/mod.rs#L32-L50) [官方源码：类型](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/crates/warp_completer/src/completer/suggest/mod.rs#L203-L225)

它的查询排序是「完全匹配 → 前缀匹配 → 按分数的模糊匹配」；不匹配的标点不做模糊回退。[官方源码：过滤排序](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/crates/warp_completer/src/completer/suggest/mod.rs#L310-L415) [官方源码：匹配器](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/crates/warp_completer/src/completer/matchers.rs#L34-L80)

不同来源合并时，高优先级在前、默认优先级保留引擎顺序、低优先级在后，最后按显示文本去重。[官方源码](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/crates/warp_completer/src/completer/coalesce.rs#L9-L66)

显示层使用替换文本、显示文本、描述、匹配位置和类型图标（参数、子命令、选项、文件、目录、Git 分支）。[官方源码](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/app/src/input_suggestions.rs#L65-L82) [图标分类](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/app/src/input_suggestions.rs#L246-L251)

Nav-Tools 不需要照搬完整模型：保留 `{ text, kind }`，只在内置规格已有说明时增加可选 `description`。排序用可预测的四段即可：

1. 大小写敏感的完全匹配；
2. 大小写敏感的前缀匹配；
3. 大小写不敏感的前缀匹配；
4. 模糊匹配（若启用）。

同级保留数据源顺序，按 `text` 去重；历史整行不塞进 Tab 菜单，交给 autosuggestion / history 面板。

## 键盘交互

- `Tab`：唯一前缀候选直接插入；多候选有更长公共前缀时先补公共部分并打开菜单，否则只打开菜单。Warp 官方源码明确建模了这三种结果。[官方源码](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/crates/warp_completer/src/completer/suggest/mod.rs#L459-L511)
- `↑/↓` 和鼠标：选择候选；`Esc`：关闭菜单。[补全文档](https://docs.warp.dev/terminal/command-completions/completions) [编辑器文档](https://docs.warp.dev/terminal/editor)
- 菜单初开时**不预选**第一项；用户按箭头后才选中。这样 `Enter` 在未选中时仍执行原输入，避免误接受第一候选。Warp 的 UI 模型支持 `Unselected`。[官方源码](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/app/src/input_suggestions.rs#L303-L311) [选择逻辑](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/app/src/input_suggestions.rs#L578-L610)
- 右箭头：仅当光标在行尾且有灰字建议时接受；否则保持普通移动光标。`Tab` 若改为接受灰字，补全菜单应改用 `Ctrl+Space`。[官方文档](https://docs.warp.dev/terminal/command-completions/autosuggestions)
- `Enter` 接受候选时只回填，不执行；再按一次 `Enter` 才提交。这与现有 `Ctrl+R` 历史回填一致。

## Shell 与会话边界

Warp 支持 bash、zsh、fish 和 PowerShell；Windows 上列出 PowerShell 5/7、WSL2 与 Git Bash，明确不支持 `cmd.exe`。[官方文档](https://docs.warp.dev/getting-started/supported-shells) Warp 的补全文档声称该功能可用于本地与 SSH；Warpified SSH 的功能表也列出输入编辑器、补全、自动建议和历史。[补全文档](https://docs.warp.dev/terminal/command-completions/completions) [SSH 功能表](https://docs.warp.dev/code/ssh-feature-support)

这不能直接类推到 Nav-Tools：Warp 拥有自己的输入编辑器，而 Nav-Tools 的 xterm 视图把按键交给 PTY/Shell。因此：

- **GUI 视图**：由 `TerminalGuiView.vue` 实现灰字建议与候选菜单，全部本地、离线。
- **xterm 视图**：不拦截 `Tab` / 右箭头，保留 PowerShell PSReadLine、bash/readline 等 Shell 原生行编辑。Warp 也列出多种 shell 补全插件与其原生编辑器不兼容，说明同时接管按键会产生冲突。[官方已知问题](https://docs.warp.dev/support-and-community/troubleshooting-and-support/known-issues)
- **SSH / WSL 路径**：候选必须来自对应会话的远程列目录通道，不得读本机 `cwd`。本仓库已有三通道目录列举 seam，只需复用，不新建 shell 插件。

## 建议的交付顺序

1. 会话历史整行前缀→单条灰字建议，右箭头接受。
2. Tab 菜单保留规格候选，增加当前会话 `cwd` 的文件/目录候选。
3. 菜单初始不预选；实现「唯一候选 / 最长公共前缀 / 打开菜单」的 `Tab` 分支。
4. 复用现有 `FuzzyMatch` 增加近似候选与命中字符高亮；精确/前缀候选始终在前。

暂不做：数百份命令规格、别名展开、Git 分支等动态提供器、跨会话历史合并、配置面板、AI 建议。只在实际使用表明内置规格 + 路径 + 会话历史不够时再加。

## 许可证边界

Warp 官方仓库声明仅 `warpui_core` / `warpui` 是 MIT，其余代码是 AGPL v3。[官方许可说明](https://github.com/warpdotdev/warp/blob/4fa1a3c664a9cd7bea951d2c62d2815846fd3af1/README.md#L54-L58) 因此本文只提炼可观察行为和数据形状，**不复制** `warp_completer` / `app` 的实现代码或 `command-signatures-v2` 数据。
