# Open-GNSS 接入与同步

Nav-Tools 的 GNSS-Lib 使用 [Open-GNSS](https://github.com/salmoshu/Open-GNSS) 的 `rnx2rtkp` 进行后处理，使用 `rtkrcv` 进行实时定位。GNSS-Raw 使用同一项目的 WebAssembly 解码器处理 RTCM3、NMEA 与 RINEX 数据。

## 名称与依赖

项目已从 Robo-GNSS 更名为 Open-GNSS，WASM 包名同步为 `open-gnss-wasm`。`package.json` 使用 `file:vendor/open-gnss-wasm-*.tgz` 依赖，Worker 从 `open-gnss-wasm` 导入解码器；导出的 API 保持一致。

数据接入的“自动识别”按文件内容判断 RTCM3、RINEX、NMEA、RTKLIB POS、JSON、CSV 和 MCAP，并在格式下方显示结果。设置页的“自动识别格式”可为每个应用独立选择允许识别的格式；GNSS 默认启用 NMEA/POS，GNSS-Raw 默认启用 RTCM3/RINEX。用户也可手动指定格式。CSV 证据不足时提示可能的格式，需手动确认。

拖入、文件选择及最近文件使用相同检测规则，RTCM/RINEX 的通用后缀与无后缀文件也可识别。串口与 TCP/UDP 输入使用跨包检测；RTCM3 使用原始字节传给 GNSS-Raw 的增量解码器。未知二进制数据展示前 64 KiB 的十六进制预览。

## 同步 WASM

在 Open-GNSS 的 `wasm` 目录构建解码器后，再从 Nav-Tools 根目录同步：

```bash
# 在 Open-GNSS/wasm 中执行，需要 emsdk 提供 emcc
node build.mjs
node test/smoke.mjs

# 返回 Nav-Tools 根目录后执行
bash scripts/sync-open-gnss-wasm.sh /path/to/Open-GNSS/wasm
pnpm install
```

省略路径时，脚本从自身所在仓库定位源码，优先查找 `../../04-GNSS/Open-GNSS/wasm` 或同级 `Open-GNSS/wasm`，并兼容相应位置仍命名为 `Robo-GNSS` 的本地目录。显式传入的相对路径基于调用时的工作目录；带空格的路径需要加引号。

旧入口 `scripts/sync-robo-gnss-wasm.sh` 会转发到新脚本。更新上游包版本后，还需同步 `package.json` 中指向新 tarball 的 `file:vendor/...` 依赖，再执行 `pnpm install`。CI 使用仓库中的 vendor 包，无需检出 Open-GNSS 或运行同步脚本。

## 配置本地定位程序

GNSS-Lib 使用一个「GNSS 解算 / GNSS Solver」组件，在「后处理」和「实时解算」之间切换。按 Open-GNSS 的 `doc/build/consapp.md` 构建命令行程序，然后在对应模式的「输入」页选择可执行文件：

| 模式                | 程序       | Open-GNSS Release 构建产物示例                                                                                                                                |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后处理（RTKPOST）   | `rnx2rtkp` | Windows GCC：`build/Windows/gcc-release/bin/rnx2rtkp.exe`；MSVC：`build/Windows/msvc-release/bin/rnx2rtkp.exe`；Linux：`build/Linux/gcc-release/bin/rnx2rtkp` |
| 实时解算（RTKNAVI） | `rtkrcv`   | Linux：`build/Linux/gcc-release/bin/rtkrcv`                                                                                                                   |

Open-GNSS 当前仅提供 Linux/WSL 的 `rtkrcv` 构建支持。Nav-Tools 在本机直接启动所选程序，因此程序必须能在运行 Nav-Tools 的系统中执行；Windows 桌面端不会自动通过 WSL 启动 Linux 程序。

更名后已有的可执行文件路径仍可继续使用。

## 统一解算工作区

GNSS-Lib 默认包含三个可独立调整大小和位置的组件：

- **GNSS 解算**：模式切换、输入、选项和结果摘要。组件底部固定显示状态栏，后处理展示进度与最新一行 `processing : ... Q=...`，实时模式展示运行状态、耗时和历元数；切换页面或滚动输入区时状态栏保持可见。
- **消息**：切换「解算记录」和「运行日志」，支持搜索、清空与导出。该工作区为只读消息视图，不显示串口发送和 IAP 操作。解算记录保留本次任务的全量数据用于时间轴定位；运行日志保留最近 10,000 条。
- **Deviation**：复用散点、地图轨迹与 ENU 时序视图，使用当前任务的独立数据源。坐标偏差以任务中第一个有效定位点为起点。

后处理与实时模式分别保存输入和选项。切换模式不会清空上一任务的结果；启动新任务时才重置消息、统计和坐标起点。运行中及停止收尾期间禁止切换模式，主进程也会阻止跨窗口并行启动两种解算引擎。

后处理成功后，工作区读取完整输出文件用于轨迹、ENU 与统计；实时模式逐批传递全部定位历元，并在停止时读取最后一批数据。普通 GNSS 应用的串口、文件导入、消息和时间轴与解算工作区相互独立。页面刷新后可重新连接仍在运行的本窗口任务；实时任务会读取已生成的文件并接续后续历元。

后处理完成或实时任务停止后，工具栏显示该任务的时间轴，支持拖动、逐历元查看与按倍速播放。它独立于普通 GNSS 文件的时间轴；切换应用时显示当前工作区的数据。Deviation 的散点或地图轨迹点支持双击定位：回放会暂停在对应历元，消息滚动并高亮定位记录，地图当前点、状态视图及解算摘要同步更新。GNSS 应用中的文件数据也使用同一操作，Sky Plot 与 Signals 会读取该历元已记录的卫星信息；仅包含定位记录的 POS/RMC/GGA 文件不提供逐星方位角与信噪比。

GNSS 应用的串口及网络 NMEA/POS 输入也支持停止后回看：接收时显示最新数据，手动停止或异常断开后建立历史时间轴，双击轨迹或拖动时间轴即可联动消息、Sky Plot、Signals 和状态视图。实时消息栏仍使用原有的滚动缓存；本次接收的原始文本另行保留在内存中，停止后用于建立完整消息索引，因此暂停消息显示不会漏掉历史记录。同一数据源重连时退出历史游标、恢复最新状态并接续已有历史；切换数据源或解析类型时开始新的数据集。历史数据在本次应用运行期间保留，需要长期保存时应导出消息或启用日志记录。RTKNAVI 使用 NTRIP 输入时，其定位结果同样可以在停止任务后回看。

使用 `-k` 配置文件时，`rnx2rtkp` 先加载配置，再应用命令行支持的覆盖参数。LLH 等默认选项没有显式的反向覆盖开关，因此配置中的 `out-solformat=nmea` 可以使 `.pos` 文件实际包含 NMEA。工作区按结果内容识别 NMEA 及 POS 文本格式，扩展名不决定解析方式。NMEA 的 GGA 质量值会转换为 RTKLIB 的定位状态用于固定解、浮点解等统计。

实时输出路径留空时，每个任务在应用数据目录的 `gnsslib/rtknavi/results` 下保存独立的 `.pos` 文件，具体路径显示在「结果摘要」中。指定输出路径时，引擎启动会重新写入该文件。停止任务会保留输出文件和已显示的解算结果。

升级时会将旧 `gnsslib-rtkpost`、`gnsslib-rtknavi` 和 `gnssraw-rtkpost` 入口合并为 `gnsslib-solver`，并为 GNSS-Lib 补充消息与 Deviation 组件。应用名称、自定义描述、原有布局位置及两种模式的解算配置会保留；迁移只执行一次，之后仍可按需移除组件。
