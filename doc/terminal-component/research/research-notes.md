# v1.5.0 GUI 终端调研底稿

> 本文是 v1.5.0「终端组件支持 GUI 视图」设计的前期调研记录，结论已收敛进 `../03-implementation.md`。
> 调研由 codex 会话发起，kimi 接力核实并补充一手来源。

## 核心判断

不要把 xterm.js 替换成「任意 HTML 终端」。传统终端本质是字符网格 + VT 控制序列：`vim`、`top`、进度条、光标回写、alternate screen 都依赖精确的行列状态，直接转成普通 HTML 文档会破坏兼容性。正确方向是「兼容终端 + 语义化命令块 + 受控富内容」的混合架构。

## 三条路线对比

| 路线 | 优点 | 主要问题 | 结论 |
|---|---|---|---|
| 增强现有 xterm | 兼容所有 Shell/TUI，改造小 | 富文本能力有限 | 第一阶段立即做 |
| DOM/HTML 终端（DomTerm 式） | 排版能力最强 | 自定义协议、HTML 安全清洗、性能、TUI 兼容都复杂 | 不替换，仅参考 |
| xterm + 结构化事件 + 富内容块 | 兼容性和阅读体验兼得 | 需要命令语义协议 | 推荐主路线 |

## 开源实现与协议

- **VS Code Terminal Shell Integration**：用 OSC 133/633 标记提示符、命令、输出和退出码，实现命令导航、状态装饰、复制输出、重新运行、sticky scroll。最适合 Nav-Tools 第一阶段。
  <https://code.visualstudio.com/docs/terminal/shell-integration>
- **Wave Terminal**：最接近目标形态的产品——底层仍是 xterm.js，Markdown、图片、CSV、编辑器、网页作为独立 block 展示（Apache-2.0）。
  <https://github.com/wavetermdev/waveterm>
- **DomTerm**：真正的 DOM 终端，定义 OSC 72 插入清洗后的 HTML；扩展协议仍可能变化，白名单策略自述仍在完善，只适合参考实验。
  <https://domterm.org/Wire-byte-protocol.html>
- **xterm.js 官方 addon**：链接、图片、进度、搜索、序列化，以及 marker / DOM decoration API，可先获得一批「现代终端」能力。
  <https://github.com/xtermjs/xterm.js/>、<https://xtermjs.org/docs/api/terminal/interfaces/idecoration/>
- **Jupyter display protocol**：MIME bundle——同一结果同时提供 `text/plain` 回退与 `text/markdown`、`application/json`、`image/png` 等表现形式，前端选安全 renderer；`display_id` 可更新已有结果，适合进度与实时图表。
  <https://jupyter-protocol.readthedocs.io/en/latest/messaging.html>

## Kimi Web 架构（灵感来源）

Kimi Web 不是「读取 TUI 字符再美化成 HTML」，而是**无界面会话核心 + 多套独立前端**：

```text
Kimi Agent / Session Core
├─ TUI 前端：渲染成终端字符
├─ Web 前端：渲染成 HTML 组件（消息、工具调用、diff、审批、图片）
└─ ACP 前端：JSON-RPC 接入 IDE
```

Web 层拿到的是结构化事件（assistant 消息、reasoning、tool call、diff、approval、执行状态），而不是压扁后的 ANSI 字符流。这是它能漂亮呈现的根本原因。
<https://www.kimi.com/code/docs/en/kimi-code-cli/guides/web.html>

## Kimi Code 对外接口事实（2026-08-30 核实官方文档）

### ACP（`kimi acp`）

- 经 stdin/stdout 的 JSON-RPC，面向 IDE 的标准协议（Zed/JetBrains 同款）。
- 稳定面覆盖 10/12：`initialize`、`authenticate`、`session/new`、`session/load`（回放历史）、`session/resume`、`session/prompt`（流式 `agent_message_chunk`）、`session/cancel`、`session/list`、`session/set_mode`、`session/set_config_option`。
- 反向 RPC：`session/update`（消息/工具调用/plan 流）、`session/request_permission`（审批）、`fs/read_text_file` / `fs/write_text_file`（文件读写路由到客户端）。
- 未实现：`session/close`、`logout`、`terminal/*` 反向 RPC（shell 命令由 agent 本地执行）。
- 来源：<https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp.html>

### Kimi Web Server API（`kimi web`）

- REST `/api/v1`（+ `/api/v2/sessions`、`/api/v2/mcp`）与 WebSocket 事件流 `/api/v1/ws`。
- Bearer token 鉴权（启动横幅打印 `#token=`），默认 `127.0.0.1:58627`，端口占用自动递增。
- 提供 `/openapi.json` 与 `/asyncapi.json` 活规范。
- **官方明确标注 experimental：接口稳定性不保证，端点/字段/事件类型任何版本都可能变。**
- 来源：<https://www.kimi.com/code/docs/en/kimi-code-cli/reference/server-api.html>

## 安全结论

不允许远端程序（含 SSH 对端）向 Electron 页面输出任意 HTML。只接受白名单 MIME 类型；必须支持 HTML 时严格清洗并放入无脚本、无同源权限的 sandbox iframe，防止 `<script>`、事件属性、外链资源经 Electron 桥接访问主应用。
