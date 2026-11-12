# 相机 `set_range` / `read_range` 调查

调查日期：2026-11-12。仅做本地静态资料核查，未连接设备、未发送命令。下文 `参考项目/` 指 `E:/Proj-Enhanced/00-规划与笔记/Mind-Forge/raw/03-项目/01-机器人/E-Wagon-Vision/文档资料/参考项目/`。

## 结论

1. **旧固件 `2.1.0.250930seg13` 未实现 `set_range` 或 `read_range`。** 完整的 0x1 子命令分发函数只有六个分支，二者均不在其中；未知子命令直接返回、不发送响应。旧报告所记的 `read_range` 空响应与此一致。
2. **不能确认当前实测固件 `2.1.0.250930seg15` 是否实现这两个命令，也不能确认两个参数的含义、顺序、单位或格式。** 本次归档只有 seg13 二进制及其逆向产物，没有 seg15 二进制或对应分发伪代码。后续固件新增 `set_calibParam` 说明命令集会变化，因此既不能由 seg13 推断 seg15 一定没有，也不能反推 seg15 一定有。
3. **Nav-Tools 当前把 `set_range` 预填为 `1.000,1.500`，作为协议内容没有已证实的事实依据。** 旧固件跟随目标选择逻辑中确实写死了 1.0 和 1.5 两个距离界限，数值吻合可作为厂商确认的线索；但没有证据把它们同 `set_range` 的两个参数连接起来，不能据此标注为“最小距离,最大距离”或按该含义下发。

## 命令分发与协议字符串证据

- `参考项目/ghidra/decompiled/WebServerPrepare.c:17-22`：命令服务器监听 8080，并把主命令码 1 注册到 `handle_0x1`。
- `参考项目/ghidra/decompiled/CommandServer.c:382-411,435-450`：解析包头和内容，按主命令码查找并调用处理器。
- `参考项目/reports/rea/handle_0x1.pseudo.c:69-170`：完整分发依次只有 `start_follow`（69-80）、`bbox_draw`（81-94）、`read_version`（95-105）、`read_imu`（106-120）、`read_params`（121-137）、`set_params`（138-170）。每个匹配项都是独立的 `strcmp` 分支；没有 `read_range` 或 `set_range`。
- `参考项目/reports/rea/handle_0x1.pseudo.c:171-175`：六个分支之后只做栈检查并返回，没有默认 `send`，所以未知子命令静默无响应。注意这与 `CommandServer.c:453-466` 的“未知主命令码”响应是两条不同路径，不能混淆。
- `参考项目/reports/06_protocol_strings.txt:1-8`：8080 协议字面量清单只列出上述六个子命令，没有两个 range 命令。字符串清单是分发掘证的旁证，不是单独判断命令是否存在的依据。
- `参考项目/ANALYSIS.md:43-51`：旧报告记录六个已确认子命令、range 名称不在二进制中，以及当时 `read_range` 实测空响应；`参考项目/REA-REANALYSIS.md:25-43` 的二次复核与完整伪代码吻合。本调查没有重复该设备实测。

## 1.0、1.5 的实际出处及其边界

旧固件存在一组与预填数值相同的**硬编码跟随目标选择条件**：

- `参考项目/ghidra/decompiled/classBBoxFilter.c:114-116`：启动跟随后调用 `startFollowProc(..., 1.0)`。
- 同文件 `644-648`：DWARF 原型将最后一个参数命名为 `minDist`。
- 同文件 `761-775`：计算目标距离；在 `minDist > 0` 的路径中，距离大于 1.5 的目标被排除。
- 同文件 `848-865`：最终还要求所选距离不得小于 `minDist`，且不得大于 1.5。因此该路径实际使用的是由实参 1.0 和字面量 1.5 构成的距离区间。

这些证据只说明 **seg13 的跟随目标选择行为**，不说明存在对应的网络读写命令。该函数没有解析 `set_range` 内容，`handle_0x1` 也没有调用它来设置范围。另一个 1.5 字面量用于非跟随目标上报过滤（同文件 `441-445`），同样不能作为 range 协议证据。

因此，`1.000,1.500` 的数值可能有上述行为背景，但以下事项均无来源：两个参数是否分别是最小/最大距离、是否采用逗号分隔文本、是否要求三位小数、单位是否由该命令约定、是否持久化，以及 `read_range` 的应答格式。

## 版本限制与当前默认值

- `参考项目/reports/rea/handle_0x1.pseudo.c:95-100`：`read_version` 返回字面量 `2.1.0.250930seg13`，明确限定上述逆向结论的版本范围。`参考项目/REA-REANALYSIS.md:3,13` 还说明二次复核与初次分析使用同一二进制副本。
- 对授权目录（包括忽略文件）检索 `read_range`、`set_range`、`2.1.0.250930seg15`、`set_calibParam`：range 名称只出现在 `ANALYSIS.md:51` 和 `REA-REANALYSIS.md:42` 的否定性记录中；没有 range 客户端源码、参数示例、seg15 或 `set_calibParam` 的逆向记录。目录清单中只有一份 `device/src/appMain`。
- Nav-Tools 自己的 `doc/camera-auto-calibration.md:3,8-9` 记录 2026-10 固件新增 `set_calibParam`，同文件 `15` 记录 seg15 的 `read_params` 实测应答。这些是当前项目的实测/实施记录，不是 seg15 range 命令的证据。
- 当前默认值唯一直接来源是 Nav-Tools 代码：`src/core/camera/CameraParametersStorage.ts:31-34` 写死 `set_range -> 1.000,1.500`。`tests/unit/persistence.test.ts:657-670` 和 `tests/e2e/camera-parameters-ui.spec.ts:409-422` 只验证该默认值的保存与界面恢复，不验证设备协议或业务含义。

**最终判断：保留“旧固件存在 1.0–1.5 跟随选择区间”这一事实，同时把 `set_range/read_range` 的当前固件支持情况和参数协议列为未知；在取得 seg15 逆向证据、厂商协议或经授权的针对性实测之前，不应把现有预填值描述为已确认协议。**
