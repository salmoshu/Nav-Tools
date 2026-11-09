# Kimi Code 在 Windows / Git Bash 下 Bash 后台调用卡住：证据与可能原因

## 结论先行

对本次 `tool_Rgs8H3wnI3JWy4IPgm8S5AES` 调用，**最符合证据的是：调用在后台任务注册完成之前一直没有走完，或注册/启动结果的记录与回传路径出现异常；不是已经拿到任务 ID 后，单纯等待命令结束或完成通知。**

但这不是已经定位的根因。现有 `wire.jsonl` 不能区分以下具体位置：

1. 工具执行前的调度、权限审批或 hook；
2. `BashTool` 内等待环境可用；
3. 等待 Git Bash 子进程创建；
4. 已创建进程或任务，但 `task.started` / 工具启动结果没有正常落盘、回传。

官方当前源码显示，Bash 的任务超时是在 `registerTask()` 中设置的，而后台任务 ID 是在注册后返回的。因此，**如果确实卡在注册之前，`timeout: 50` 不会覆盖这段等待，“50 秒超时未触发”并不矛盾**。不过，日志没有直接记录定时器是否创建，所以“timeout 未启动”仍是基于调用顺序的推断，不是日志直接证明的事实。

`lost` 是另一个阶段的状态：它表示恢复会话后，原运行时对非终态任务失去管理联系，**不等于进程已经退出、被杀掉或发生超时**。

## 调查范围与证据等级

- 官方文档：[内置工具](https://moonshotai.github.io/kimi-code/zh/reference/tools.html)、[配置文件](https://moonshotai.github.io/kimi-code/zh/configuration/config-files.html)、[数据路径](https://moonshotai.github.io/kimi-code/zh/configuration/data-locations.html)。
- 官方源码：`MoonshotAI/kimi-code` 可公开访问。本次检索时 `main` 指向 [`eb2035f3cad57cc12d4d5082ec626f7f0ea5f651`](https://github.com/MoonshotAI/kimi-code/commit/eb2035f3cad57cc12d4d5082ec626f7f0ea5f651)，下文源码链接固定到该提交。
- 官方仓库中的 issue / PR 用于寻找相邻故障和修复状态。**issue 正文是用户报告，PR 正文是贡献者说明，不等于 MoonshotAI 维护者已经确认根因。**
- 本地证据是指定会话的 `wire.jsonl`、任务 JSON 和已有脚本日志。
- 没有取得事发时的 Kimi Code 版本及对应提交，因此当前 `main` 只能说明现有实现和故障边界，不能证明事发版本逐行相同。
- 本次通过官方仓库搜索与 GitHub API，**未找到与“Windows / Git Bash 下这一次 Bash 后台调用未返回任务 ID”完全同案的官方 issue**。这不排除存在未被索引或使用其他措辞的报告。

## 本地日志能证明什么

指定文件：

`C:/Users/Salmos/.kimi-code/sessions/wd_nav-tools_6fa4813ce910/session_f68e2a3d-4ed0-4fd3-a257-e1fac2af812e/agents/main/wire.jsonl`

### 正常的同脚本对照调用

- 第 9263 行：模型发出 Bash 调用，命令为 `node tmp/video/work/check-nmea2.mjs > tmp/video/work/check-nmea2.log 2>&1`，`run_in_background=true`，`timeout=50`。
- 第 9264 行：写入 `task.started`，任务为 `bash-s9rb0tgt`，`timeoutMs=50000`。
- 第 9265 行：工具结果包含该任务 ID，`durationMs=7`。
- 第 9270 行：写入 `task.terminated`，状态为 `failed`、`exitCode=1`；`endedAt-startedAt=732ms`。
- 第 9278 行：对应失败通知进入上下文，通知中的 `Wall time` 也是 `0.732 seconds`。

这证明同一命令、同一后台参数形式此前能完成“注册—返回 ID—进程退出—终态记录—通知”全链路。脚本的这次快速失败不是 50 秒超时。

### 本次异常调用

- 第 9306 行：模型发出另一次同脚本 Bash 调用，toolCallId 为 `tool_Rgs8H3wnI3JWy4IPgm8S5AES`，仍为 `run_in_background=true`、`timeout=50`。
- 第 9307 行：下一条是 `turn.cancel`，`reason=user_cancelled`。
- 第 9308 行：人工中断后的工具错误结果，`durationMs=24047828`，即 **24047.828 秒，约 400.8 分钟（6 小时 40 分 47.828 秒）**。
- 第 9306 行与取消之间没有本次调用的 `task.started`、`task.terminated` 或含任务 ID 的正常工具结果。
- 按该 toolCallId 检查 `agents/main`，没有找到对应的任务生命周期事件；在 `agents/main/tasks/*.json` 中也没有找到 `parentToolCallId` 为该值的记录。后文第 9399、9400 行只是 `agent.message.appended` 形式的调用/错误消息记录，不是新的任务生命周期事件。

因此，日志可以证明：**正常后台启动应答没有被记录，调用一直未正常结束，最后由人工取消收尾。** 它不能证明“内部从未生成过 ID”，也不能仅凭缺少事件就断言操作系统进程从未创建。

### `ui-check.log` 不是本次 400 分钟命令的证据

`E:/Proj-Enhanced/02-上位机/Nav-Tools/tmp/video/work/ui-check.log` 第 204–217 行记录的是另一次 `ui-check.mjs` 中的 `page.screenshot: Timeout 4000ms exceeded`，调用栈指向截图操作，且已经显示字体加载完成。

它能证明那次 Playwright 截图超时，**不能证明本次 `check-nmea2.mjs` 卡住的位置，也不能证明 Kimi 的 Bash 超时、任务注册或通知机制发生了同一种故障。**

### 一个容易误读的单位问题

官方中文网页目前把 Bash 的 `timeout` 写为“毫秒”，但当前官方 [`bash.ts`](https://github.com/MoonshotAI/kimi-code/blob/eb2035f3cad57cc12d4d5082ec626f7f0ea5f651/packages/agent-core-v2/src/agent/tools/os/bash/bash.ts) 的参数 schema 明确使用秒，并由 `bashTool.ts` 乘以 1000。本次正常对照任务也把 `timeout: 50` 持久化为 `timeoutMs: 50000`。

所以本次应按 **50 秒**分析，不能误写成 50 毫秒。网页与源码/实测单位不一致，适合另行反馈文档问题。

## 官方源码揭示的调用边界

当前 [`bashTool.ts`](https://github.com/MoonshotAI/kimi-code/blob/eb2035f3cad57cc12d4d5082ec626f7f0ea5f651/packages/agent-core-v2/src/agent/tools/os/bash/bashTool.ts) 的关键顺序是：

```text
收到工具参数
  → 校验请求
  → await acquireOrWhenReady(..., ['process'])
  → await spawn(Git Bash / 对应环境 shell)
  → 关闭进程 stdin
  → registerTask(...)
       → 设置任务 timeout
       → 安排 ProcessTask.start(...)
       → 记录 task.started
  → run_in_background=true 时组织并返回 task_id
```

[`agentEnvironment.ts`](https://github.com/MoonshotAI/kimi-code/blob/eb2035f3cad57cc12d4d5082ec626f7f0ea5f651/packages/agent-core-v2/src/agent/environmentBinding/agentEnvironment.ts) 中，环境不可用时会走 `acquireWhenReady()`。这段 `BashTool.execution()` 没有给环境获取和 `spawn()` 两个前置 `await` 包裹 Bash 的任务超时。

[`hostProcessService.ts`](https://github.com/MoonshotAI/kimi-code/blob/eb2035f3cad57cc12d4d5082ec626f7f0ea5f651/packages/agent-core-v2/src/os/backends/node-local/hostProcessService.ts) 的本地实现等待 Node 子进程的 `spawn` 或 `error` 事件后才返回；标准输入/输出/错误均通过 pipe 建立，Windows 默认 `detached=false`、`windowsHide=true`。

[`taskService.ts`](https://github.com/MoonshotAI/kimi-code/blob/eb2035f3cad57cc12d4d5082ec626f7f0ea5f651/packages/agent-core-v2/src/agent/task/taskService.ts) 的 `registerTask()` 在同步生成任务 ID 后设置 `timeoutHandle`，再通过微任务启动任务生命周期。后台任务返回 ID 不以进程退出为条件。

两个重要限制：

- `recordTaskStarted()` 使用 `void dispatcher.dispatch(...)`，没有等待事件写入完成。因此缺少 `task.started` 不能单独构成“`registerTask()` 绝未执行”的数学证明。
- `tool.call` 只证明模型请求了工具，不证明已经越过外层的审批、hook 和执行调度。本文没有从现有日志恢复出这些更细粒度的内部轨迹。

## 三种情况必须分开

### 情况一：工具调度未启动，或卡在任务注册之前

**典型外观**：只有 `tool.call`；没有正常工具结果、任务 ID、`task.started`；Bash 的任务超时没有机会启动。

**与本次的吻合度：最高。** 但“调度未启动”和“已经开始执行、卡在前置 await”仍需区分。

源码支持的可能位置包括：

- 外层工具调度、审批或 hook 尚未放行；
- 等待具备 `process` 能力的环境；
- 等待 Git Bash 的 `spawn`/`error` 事件；
- 更罕见地，内部已走到注册或结果生成，但事件/结果回传未完成。

官方仓库的 [#3556](https://github.com/MoonshotAI/kimi-code/issues/3556) 报告过“审批请求未渲染，轮次一直挂起到人工中止”。这只能证明 Kimi 存在这类前置卡顿的报告；该 issue 的平台是 **macOS 上的 VS Code 扩展**，不是 Windows / Git Bash，也没有证明本次正在等待审批。

### 情况二：进程或管道已经启动，但执行/退出受阻

**典型外观**：应当先看到 `task.started` 和包含任务 ID 的启动结果；之后可能长期没有 `task.terminated`。这与本次缺少启动生命周期记录的外观不同。

当前 [`process-task.ts`](https://github.com/MoonshotAI/kimi-code/blob/eb2035f3cad57cc12d4d5082ec626f7f0ea5f651/packages/agent-core-v2/src/agent/tools/os/bash/process-task.ts) 中：

- 任务主体等待 `proc.wait()`；
- stdout/stderr 有数据监听；
- 进程退出后，等待流收尾有 250ms 宽限，不是无限等待 EOF；
- `bashTool.ts` 在注册前调用 `proc.stdin.end()`，与官方文档“stdin 始终被关闭”一致。

因此，不能直接把“交互命令等待 stdin”或“shell 已退出但管道永远不 EOF”套到当前 `main`，更不能用它解释本次为何连启动 ID 都没有。事发版本不同、进程未退出、运行环境事件循环受阻等仍是假设，需额外证据。

Windows 下，[`hostProcessService.ts`](https://github.com/MoonshotAI/kimi-code/blob/eb2035f3cad57cc12d4d5082ec626f7f0ea5f651/packages/agent-core-v2/src/os/backends/node-local/hostProcessService.ts) 使用 `taskkill /T /F /PID <pid>`。其 `kill()` 在 `taskkill` 自身关闭后返回，不检查退出码，也不逐一证明所有 MSYS/Git Bash 后代都已退出。这是一个需要实测的进程树风险点，**不是本次卡住的已证实原因**。

官方 [#4028](https://github.com/MoonshotAI/kimi-code/issues/4028) 报告了会话结束后残留子进程以及 `lost` 不回收 PID 的问题，但其环境是 **macOS 桌面端**，且检索时仍为 open、无维护者确认评论。不能拿其中的 macOS 现象直接替代 Windows 结论。

### 情况三：任务已结束，但完成通知没有返回 Agent 或客户端

**典型外观**：已经有任务 ID 和 `task.started`；进程/任务已产生 `task.terminated` 或持久化终态，但缺少对应的任务通知，或者客户端没有实时显示。

当前 `taskService.ts` 的 `settleTask()` 会进入 `fireTerminalEffects()`，其中分别调用 `notifyAgentTask()` 和 `recordTaskTerminated()`。`notifyAgentTask()` 在 agent 生命周期已结束时会跳过并写诊断日志；通知还经过主循环排队。这说明“终态已落盘”和“通知已送达”确实是两个可分开的环节。

相关但不能混同的官方报告：

- [#2878](https://github.com/MoonshotAI/kimi-code/issues/2878)：ACP 客户端收不到内部触发轮次的实时 `session/update`，但 agent 内部执行和 wire 持久化仍存在。这是 **ACP 展示/推送层**问题，不是 Bash 进程没有结束。
- [#3924](https://github.com/MoonshotAI/kimi-code/issues/3924)：异常退出后，冷会话 UI 从单独的 `task.started` 重建为 `running`，而 `/tasks` 已无活动任务。这是状态投影不一致的报告。
- [#3350](https://github.com/MoonshotAI/kimi-code/issues/3350)：后台 **Agent** 在 `lost` 后 resume，没有补写新的 `task.started`。它不能解释一个首次 Bash 调用为何在注册前卡住。

本次目标调用没有任务 ID、`task.started` 和 `task.terminated`，所以“纯完成通知丢失”不是首要解释。若实际情况是“内部已生成启动应答，但应答未回传”，那属于**启动结果回传故障**，也不应与后台完成通知丢失混为一谈。

## 会话中断后为什么出现 `lost`

当前 `taskService.ts` 的恢复路径为：

```text
restoreAfterReplay()
  → 从 wire / 磁盘恢复 ghost 任务
  → reconcile()
  → markLoadedTasksLost()
  → 对非终态 ghost 写入 status=lost、endedAt
  → 记录 task.terminated(lost)，并提醒上一个会话的任务失联
```

该函数在当前提交中没有对进程 PID 做存活探测。恢复提醒还明确说“they may still be running”。所以：

- `lost` 描述的是**管理联系/运行时所有权丢失**；
- 它不是 OS 进程退出码；
- 它不是 `timed_out`；
- 它不能证明原进程已停止，也不能证明它仍在运行；
- 本次 9306 调用没有对应的已注册任务，不能用其他旧任务后来变成 `lost` 来填补它缺失的生命周期。

官方 [#1924](https://github.com/MoonshotAI/kimi-code/issues/1924) 报告了恢复时将仍存活任务标为 `lost`、进而重复恢复的问题，环境为 Linux 多进程恢复。对应 [#2190](https://github.com/MoonshotAI/kimi-code/pull/2190) 提议在标 `lost` 前做 PID 存活探测；检索时该 PR 仍为 **open、`merged=false`**，不能写成已经修复。

## 本次日志不能证明的事项

现有材料不足以断言：

1. Bash 工具函数是否实际进入，或者卡在审批/hook；
2. Git Bash、Node 或 Playwright 是否为本次调用创建过 OS 进程；
3. 目标脚本是否运行了 400 分钟，还是根本未运行；
4. 50 秒定时器是否曾创建、是否被事件循环阻塞、是否启动后被杀进程问题拖住；
5. 是否发生了 stdout/stderr 管道阻塞；
6. 是否有任务完成通知生成后丢失；
7. `lost` 对应进程是否仍活着；
8. 当前 `main` 是否与事发版本实现一致。

同一脚本前一次正常，只能排除“这个参数形式每次都必然失败”，不能排除状态相关的调度、环境、进程或时序问题。

## 后续取证建议与注意事项

要定位到具体环节，应保留同一故障窗口内的证据，而不是只看最终 `user_cancelled`：

1. 记录事发版本、安装来源和对应源码提交；当前源码结论必须和实际版本对齐。
2. 按官方[数据路径说明](https://moonshotai.github.io/kimi-code/zh/configuration/data-locations.html)，检查会话级 `logs/kimi-code.log` 与全局 `logs/kimi-code.log`，查找任务通知、spawn、审批和生命周期错误。
3. 保存完整 `wire.jsonl`、`agents/main/tasks/`，以 toolCallId 关联 `tool.call`、`task.started`、任务 JSON、`task.terminated` 和通知，而不是只看命令文本。
4. 若故障复现，在卡住当时采集 `bash.exe`、`node.exe`、相关浏览器进程和 `taskkill.exe` 的 PID、父子关系、启动时间与命令行；事后的进程列表无法还原当时状态。
5. 保存重定向日志的文件时间、本次输出及脚本自身的阶段标记。仅有 `ui-check.log` 的截图超时不能替代这些证据。
6. 用同版本、同环境的最小后台命令做受控复现，分别验证“立即返回 ID”和“到期产生 `timed_out`”；不要把长测试或常驻服务作为最小复现。

使用官方工具时还需注意：

- 后台模式按契约应立即返回任务 ID；没有 ID 时，不应假设已经可以靠 `TaskOutput` / `TaskStop` 管理它。
- 显式 `timeout` 是任务运行超时，不应被理解为覆盖审批、调度、环境准备和进程创建的全局看门狗。
- 前台超时默认转后台；这与一开始就设置 `run_in_background=true` 是不同路径。配置项见官方[`task` 配置](https://moonshotai.github.io/kimi-code/zh/configuration/config-files.html#task)。
- Windows 默认使用 Git Bash；stdin 会被关闭，不能依赖交互输入。
- `disable_timeout=true` 只会取消任务超时，不会修复注册前卡顿；shell 内部再包一层 `timeout` 也无法约束尚未进入 shell 的等待。

## 最终判断

**本次最有根据的故障域是“后台任务注册/启动应答之前”，而不是已经登记的后台进程单纯运行太久。** 当前源码中任务 timeout 的启动点解释了为什么注册前等待可以远超 50 秒；但具体是调度、审批、环境获取、Git Bash 创建，还是事件/结果落盘异常，现有日志不能定论。

会话恢复后的 `lost` 和完成通知未送达属于后续、独立的任务生命周期问题。它们值得依据官方 issue 继续跟踪，但不能倒推为本次 400 分钟卡住的原因。

## 2026-11-08 制作恢复时的执行观察

本轮改用当前 Codex 的 PowerShell 执行接口，继续完成录屏、语音和 PDF 制作，没有修改 Kimi Code 或宿主程序。短命令正常返回，持续录制和合成均取得会话 ID，再通过 `write_stdin` 收到明确退出码；未复现原先“后台调用长时间没有任务 ID”的症状。这只能证明本轮执行路径可用，不能证明原 Kimi 故障已经修复。

执行时为每章保留 `record-*.log`，录屏脚本设 90 秒总看门狗，模拟器设置 180 秒自动退出，FFmpeg 子进程也有独立超时。后台应用及模拟器均记录 PID，启动时使用隐藏窗口。当前接口的 `yield_time_ms` 仅控制等待多久返回会话句柄，不是进程运行超时。

一次补录因旧模拟器已按时退出而没有收到 HEX 应答，录制脚本以 `HEX evidence missing` 和退出码 1 明确失败，并非终端卡死。随后增加 `tmp/video/recorder/record-scene.ps1`：每章启动新的模拟器，在 `finally` 中回收。合成前还会检查各章日志，拒绝失败或未完成的录制。后续定位仍应分别核对“工具是否返回”“脚本是否完成”“设备是否仍在线”。
