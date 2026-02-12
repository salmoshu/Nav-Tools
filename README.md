<h1 align="center">Lichtblick</h1>

<div align="center">
  <a href="https://github.com/lichtblick-suite/lichtblick/stargazers"><img src="https://img.shields.io/github/stars/lichtblick-suite/lichtblick" alt="Stars Badge"/></a>
  <a href="https://github.com/lichtblick-suite/lichtblick/network/members"><img src="https://img.shields.io/github/forks/lichtblick-suite/lichtblick" alt="Forks Badge"/></a>
  <a href="https://github.com/lichtblick-suite/lichtblick/pulls"><img src="https://img.shields.io/github/issues-pr/lichtblick-suite/lichtblick" alt="Pull Requests Badge"/></a>
  <a href="https://github.com/lichtblick-suite/lichtblick/issues"><img src="https://img.shields.io/github/issues/lichtblick-suite/lichtblick" alt="Issues Badge"/></a>
  <a href="https://github.com/lichtblick-suite/lichtblick/issues"><img src="https://img.shields.io/github/package-json/v/lichtblick-suite/lichtblick" alt="Versions Badge"/></a>
  <a href="https://github.com/lichtblick-suite/lichtblick/graphs/contributors"><img alt="GitHub contributors" src="https://img.shields.io/github/contributors/lichtblick-suite/lichtblick?color=2b9348"></a>
  <a href="https://opensource.org/licenses/MPL-2.0"><img src="https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg" alt="License: MPL 2.0"></a>

  <br />
<p  align="center">
Lichtblick 是一款用于机器人技术的集成可视化和诊断工具，可在浏览器中或作为 Linux、Windows 和 macOS 上的桌面应用程序使用。
</p>
  <p align="center">
    <img alt="Lichtblick 截图" src="resources/screenshot.png">
  </p>
</div>

## :rocket: 试用 Lichtblick

**[立即在浏览器中试用 Lichtblick！](https://lichtblick-suite.github.io/lichtblick/)**

无需安装 - 直接在您的网页浏览器中体验 Lichtblick 的全部功能！

## :book: 文档

需要有关使用 Lichtblick 的指导？请查看我们的[官方文档！](https://lichtblick-suite.github.io/docs/)

我们正在积极更新文档以添加新功能，敬请期待！:rocket:

**依赖项：**

- [Node.js](https://nodejs.org/en/) v16.10+

<hr/>

## :rocket: 快速开始

### :whale: 使用 Docker

要通过 Docker 运行 lichtblick，您可以运行：

```sh
docker run --rm -p 8080:8080 ghcr.io/lichtblick-suite/lichtblick:latest
```

然后在浏览器中打开：http://localhost:8080/

### 📑 从源代码

克隆仓库：

```sh
git clone https://github.com/lichtblick-suite/lichtblick.git
```

启用 corepack：

```sh
corepack enable
```

从 `package.json` 安装包：

```sh
yarn install
```

- 如果在运行 `corepack enable` 后仍然收到有关 corepack 的错误，请尝试卸载并重新安装 Node.js。确保 Yarn 不是从其他来源单独安装的，而是通过 corepack 安装的。

启动开发环境：

```sh
# 启动桌面应用程序（在不同的终端中运行脚本）：
yarn desktop:serve        # 启动 webpack 开发服务器
yarn desktop:start        # 启动 electron（确保 desktop:serve 已完成构建）

# 启动 Web 应用程序：
yarn run web:serve        # 将在 http://localhost:8080 上可用
```

:warning: Ubuntu 用户：应用程序在使用 GPU 时可能会出现一些问题。为了绕过 GPU 并直接使用 CPU（软件）进行处理，请使用设置为 `1` 的变量 `LIBGL_ALWAYS_SOFTWARE` 运行 lichtblick：

```sh
LIBGL_ALWAYS_SOFTWARE=1 yarn desktop:start
```

## :hammer_and_wrench: 构建 Lichtblick

使用以下命令构建生产环境的应用程序：

```sh
# 构建桌面应用程序：
yarn run desktop:build:prod   # 编译必要的文件

- yarn run package:win         # 打包 Windows 版本
- yarn run package:darwin      # 打包 macOS 版本
- yarn run package:linux       # 打包 Linux 版本

# 构建 Web 应用程序：
yarn run web:build:prod

# 使用 Docker 构建并运行 Web 应用程序：
docker build . -t lichtblick
docker run -p 8080:8080 lichtblick

# 可以使用以下命令清理构建文件：
yarn run clean
```

- 桌面版本构建位于 `dist` 目录中，Web 版本构建位于 `web/.webpack` 目录中。

## :warning: 关于 Linux 依赖项的说明（仅 .tar.gz）

安装 **`.tar.gz` 包**时，与 `.deb` 不同，**系统依赖项不会自动安装**。

在许多情况下，如果您已经安装了 **Google Chrome** 或其他基于 Chromium 的应用程序，Lichtblick 将正常运行，因为这些应用程序带来了大部分必需的库。

但是，如果在启动 Lichtblick 时看到有关缺少库的错误，您将需要手动安装它们。

最常见的缺失依赖项有：

- `libgtk-3-0`
- `libatk1.0-0`
- `libatk-bridge2.0-0`
- `libatspi2.0-0`
- `libnss3`
- `libnspr4`
- `libasound2`
- `libcups2`
- `libnotify4`
- `libxtst6`
- `xdg-utils`
- `libdrm2`
- `libgbm1`
- `libxcb-dri3-0`

示例（Debian/Ubuntu）：

```bash
sudo apt-get update && sudo apt-get install libgtk-3-0 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libnss3 libnspr4 libasound2 libcups2 libnotify4 libxtst6 xdg-utils libdrm2 libgbm1 libxcb-dri3-0
```

👉 **建议**：如果使用 `.tar.gz`，请始终检查终端中的错误消息。它们将指示缺少哪个库，以便您可以手动安装。

## :pencil: 许可证（开源）

Lichtblick 遵循开放核心许可模式。大部分功能在此仓库中可用，可以根据 [Mozilla Public License v2.0](/LICENSE) 的条款进行复制或修改。

## :handshake: 贡献

欢迎贡献！Lichtblick 主要使用 TypeScript 和 ReactJS 构建。所有潜在贡献者必须同意 [CONTRIBUTING.md](CONTRIBUTING.md) 中概述的贡献者许可协议。

## :star: 致谢

Lichtblick 最初是 [Foxglove Studio](https://github.com/foxglove/studio) 的一个分支，这是一个由 [Foxglove](https://foxglove.dev/) 开发的开源项目。
