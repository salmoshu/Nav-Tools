# Wave Terminal 借鉴点调研

> 目的：回答「waveterm 有哪些可以借鉴」。面向 Nav-Tools v1.5.0 终端 GUI 块视图
> （设计见 `../03-implementation.md`，前期调研见 `research-notes.md`）。
> 基线：`wavetermdev/waveterm` @ `a4447c156`（2026-07-29，package.json version 0.14.5），
> 浅克隆在 `tmp/waveterm`（tmp/ 已 gitignore，仅本地参考，不入库）。
> 方法：读 `aiprompts/`（项目自带架构文档）+ 后端 PTY 管线 + 前端块模型源码，结论均带 `path:line`。

## 0. 关键前提纠正

**Wave 的核心块不是「命令块」，而是「会话块」**——一个 block = 一个长期存活的 shell
会话，内部是一整块真终端。它**不按命令切分输出**：自研 OSC 16162 只取 UI 状态
（`shell:state` / `shell:lastcmd` / exitcode），从不用来切块。

但它有 **`controller:"cmd"` 模式 = 一条命令一个块**
（`frontend/app/view/term/term-model.ts:154-198`），这个形态与我们的 GUI 块视图
一对一对应。因此可借鉴的集中在两处：**cmd 块的周边 UX**，和**它「不重造终端」的
架构决策**。

## 1. 架构级可借鉴

### 1.1 后端只做裸字节管道，终端模拟完全交给 xterm.js（价值最高）

PTY 读循环全部逻辑（`pkg/blockcontroller/shellcontroller.go:552-568`）：

```go
buf := make([]byte, 4096)
for {
    nr, err := shellProc.Cmd.Read(buf)
    if nr > 0 { HandleAppendBlockFile(bc.BlockId, wavebase.BlockFile_Term, buf[:nr]) }
}
```

裸字节直接落盘，**零解析、零 ANSI 处理**。全量 grep `pkg/` 无任何 Go 侧终端模拟器；
唯一的转义解析是 `pkg/wshutil/wshcmdreader.go:36`，只抠自己的 OSC 前缀 23198 拿 RPC JSON。

**印证了既有的下一步判断**：我们的 `normalizeTerminalLayout`
（`src/core/terminal/CommandBlocks.ts:103`，约 160 行重造 CUP/CR/延迟折行/ECH/EL/宽字符）
在 Wave 里没有对应物——它把这件事整体外包给 xterm.js。Warp 同理。

配套可抄的两个细节：

- **OSC 16162 的 `R` 命令**（`frontend/app/view/term/osc-handlers.ts:361-366`）：
  若 `buffer.active.type === "alternate"` 就写 `\x1b[?1049l` 强制退出备用缓冲。
  用于「程序崩溃后卡在 vim/less 屏里」的自愈。
- **cmd 块结束时后端主动补一行**（`pkg/blockcontroller/shellcontroller.go:543-547`）：
  `\r\nprocess finished with exit code = %d\r\n`。给命令块一个明确的终止标记，
  比我们从 `D` 标记推断 `finishedAt` 更直观。

> 协议对比：Wave 用自研 OSC 16162（A/C/M/D/I/R），比 OSC 133 多 `M`（元数据 JSON）
> 与 `I`（输入是否为空）。我们的 OSC 1338 富内容通道是 `M` 的更宽版本，这块已领先，不动。

### 1.2 WPS 增量 append 协议

`pkg/wps/wpstypes.go:87`：`WSFileEventData{ ZoneId, FileName, FileOp, Data64 }`，
`FileOp` 含 `Append/Truncate/Create`。每次只发新增字节的 base64，**从不重发全量**；
订阅带 scope（`block:<id>`，支持 `*`）；状态类事件带单调 `version`，前端丢弃旧版本
（`aiprompts/blockcontroller-lifecycle.md:139-147`）；`Persist` 保留最近 N 条给迟到订阅者。

协议形状与 Go 后端无耦合，可直接对齐我们的终端会话 IPC（现状是整块重发 blocks 数组）。

### 1.3 wconfig：扁平命名空间键 + 级联覆盖

- 键为带前缀的字符串常量：`term:fontsize`、`term:*`（`pkg/wconfig/metaconsts.go:42-63`，
  `*` 表示整组清空）
- 四级级联：内置 defaults → 用户 settings.json → per-connection override → per-block meta
- per-connection 的实现：meta 里嵌一个 `"[connname]"` 子 map
  （`pkg/waveobj/metamap.go:26` `GetConnectionOverride`）
- map 类型用哨兵值删键（`pkg/waveobj/metamap.go:10` `MetaMap_DeleteSentinel`）
- per-shell 脚本同样级联回退：`shellcontroller.go:801` `getCustomInitScriptKeyCascade`
  （`initscript.bash → initscript.sh → initscript`）

我们已有 per-pane 的 `presentation` 持久化；若后续要「每台设备/每个连接用不同 shell
注入脚本或终端配置」，这套模式可低成本搬入。

## 2. 产品级可借鉴（最对口「终端对用户不友好」）

Wave 在这部分的答案不是「让终端更富文本」，而是**给零命令入口**——与我们
「工程师高频操作：拉代码、交叉编译、部署、抓日志」的场景高度吻合。

| 可抄项 | Wave 位置 | 成本 | 说明 |
|---|---|---|---|
| **Widgets 按钮栏** | `pkg/wconfig/defaultconfig/widgets.json` + `frontend/app/workspace/widgets.tsx:58` | 极低，收益最高 | 一个 JSON 数组，每条是一个 blockdef（terminal/files/web/sysinfo/processes）。可做成「预设任务面板」：预定义命令 + 表单参数 + 一键执行 + 历史，复用现有 terminal session 基建 |
| **Launcher 宫格** | `frontend/app/view/launcher/launcher.tsx:23-63` | 低 | 图标宫格 + 模糊搜索，Cmd+Shift+X 就地替换当前块 |
| **目录/文件 GUI 操作** | `frontend/app/view/preview/preview-directory.tsx:373-423` | 低，体感提升大 | New File/New Folder/Rename/Copy File Name（含 shell-quoted）/Delete |
| **块头模糊打开文件** | `frontend/app/view/preview/preview.tsx:157-165` | 低 | 只需文件索引 + fzf 式打分 |
| **Stickers** | `frontend/app/view/term/termsticker.tsx:56-90` | 中低 | 终端角落可点击按钮，执行命令或开新块，很「GUI 感」 |
| **统一右键菜单模型** | `frontend/types/custom.d.ts:153` + `aiprompts/contextmenu.md` | 低 | 一个 `ContextMenuItem[]` + `showContextMenu()`，Element Plus 可直接映射 |
| **GUI 化配置/进程/系统信息块** | `frontend/app/block/blockregistry.ts:32,36,37` | 中 | waveconfig / processviewer / sysinfo，替代手改 JSON 与敲 `ps`/`top` |
| **终端右键菜单项** | `frontend/app/view/term/term-model.ts:830-1013` | 低 | Copy（自动裁剪行尾空格）/ Open URL / 外部浏览器打开 / Save session as / 分屏 / 透明度 |

### 2.1 补全：抄交互，不抄数据源

Wave 补全**完全自研**（`pkg/suggestion/suggestion.go`，模糊匹配直接 import fzf 的
`src/algo`），且**只有文件补全与浏览器书签两类，没有命令参数补全**。

- 可抄 UI：`frontend/app/suggestion/suggestion.tsx:170-346` —— 浮动 widget +
  `@floating-ui/react` 锚定到块头，模糊匹配位置高亮、↑↓/PageUp 导航、**Tab 补全**、
  reqnum 丢弃过期结果。
- 数据源**走 withfig**（500+ CLI 声明式 spec，MIT），这比 Wave 强，也是既定方向。

### 2.2 富内容渲染选型参考

`frontend/app/view/preview/preview-model.tsx:502-554` 的分发：streaming（pdf/音视频/图片）
/ markdown / codeedit / csv / directory；`package.json` 依赖为
`monaco-editor`、`shiki`、`react-markdown + remark-gfm`、`mermaid`、`papaparse`、
`@tanstack/react-table`、`@observablehq/plot`、`overlayscrollbars`。

我们的 `TerminalRichContent.vue` 可考虑补 mermaid、目录预览；CSV 若要做键盘导航表格
可参考 `@table-nav/react`。Wave 有「>10MB 拒绝、CSV 限 1MB」这类上限策略
（`preview-model.tsx:502-554`），我们已有 `MAX_RICH_PAYLOAD_CHARS`，思路一致。

## 3. 明确跳过

- **TileLayout 布局引擎**（`frontend/layout/`，约 3600 行 + 后端往返）：引擎本身别抄，
  只抄 magnify（`frontend/app/store/keymodel.ts:548-560`）、ephemeral 临时节点
  （`frontend/layout/lib/layoutModel.ts:212-218`）、Ctrl+Shift+方向键焦点导航
  （`keymodel.ts:561-625`）这三件小事。
- **wsh companion binary + OSC 23198 RPC**（`pkg/remote/connutil.go:100` 二进制投递、
  `pkg/wshrpc/wshrpctypes.go:38-128` 命令表）：依赖 Go 交叉编译与多架构二进制分发。
  我们 OSC 1338 单向上行已够用；**只有需要双向查询**（读远端文件、探测远端能力、
  持久 job 管理）时才值得引入。
- **vdom / tsunami**：`pkg/vdom` 是 Go 实现的 mini React（`pkg/vdom/vdom_types.go:26`），
  与终端输出无关；tsunami 是「用 Go 写终端里的 GUI 应用」的 SDK。均与场景无关。
- **durable session 断线重连、multi-input 多终端同输入、webview 块**：绑定 Wave 的连接抽象。
- **Wave 的 suggestion 数据源**：只有文件/书签，不如 withfig。

## 4. 我们已经领先的部分

Wave **没有** per-command 折叠块作为主模型、**没有**耗时显示、**没有**命令间跳转导航。
我们已有：分块折叠 + 复制 + 重跑、running/success/error 三态、cwd 呈现与 `~` 压缩、
OSC 1338 富内容（比 OSC 16162 `M` 更宽）。

**结论：不移植它的布局引擎，不学它的块模型；学它「不为 GUI 重造终端」的架构决策，
加上 widgets 那套零命令入口。**

## 5. 引用索引

后端：

- `pkg/blockcontroller/shellcontroller.go:543-547` cmd 块结束追加 exit code 提示
- `pkg/blockcontroller/shellcontroller.go:552-568` PTY 裸字节读循环（无解析）
- `pkg/blockcontroller/shellcontroller.go:801` 初始化脚本键级联
- `pkg/wps/wpstypes.go:87` `WSFileEventData` 增量 append 事件
- `pkg/wconfig/metaconsts.go:42-63` 配置键命名空间常量
- `pkg/waveobj/metamap.go:10,26` 哨兵删键 / `[conn]` 子 map 覆盖
- `pkg/wshutil/wshcmdreader.go:36` OSC 23198 RPC 抽取（非屏幕重建）

前端：

- `frontend/app/view/term/term-model.ts:154-198` cmd 块头部（命令文本 + 状态图标）
- `frontend/app/view/term/term-model.ts:830-1013` 终端右键与设置菜单
- `frontend/app/view/term/osc-handlers.ts:284,312,361-366` OSC 16162 处理 / registerMarker / `R` 复位备用缓冲
- `frontend/app/view/preview/preview-model.tsx:502-554` 预览类型分发
- `frontend/app/suggestion/suggestion.tsx:170-346` 浮动补全 widget
- `frontend/app/block/blockregistry.ts:23-37` 块类型注册表
- `frontend/app/block/blockframe-header.tsx:210-292` 块头结构
- `frontend/layout/lib/types.ts:296-315` 布局节点模型
- `pkg/wconfig/defaultconfig/widgets.json` widgets 定义

文档：`aiprompts/blockcontroller-lifecycle.md`、`aiprompts/config-system.md`、
`aiprompts/conn-arch.md`、`aiprompts/fe-conn-arch.md`、`aiprompts/contextmenu.md`、
`aiprompts/wave-osc-16162.md`
