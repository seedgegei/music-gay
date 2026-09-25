# 移调 · Music Gay

[![CI](https://github.com/seedgegei/music-gay/actions/workflows/ci.yml/badge.svg)](https://github.com/seedgegei/music-gay/actions/workflows/ci.yml)
[![License: GPL v2](https://img.shields.io/badge/License-GPL--2.0--only-blue.svg)](LICENSE)

在浏览器本地给音乐升降调，保持原速，并通过共振峰补偿尽量保留人声和乐器的自然音色。

**无需上传音频、无需 API Key、无前端运行时网络依赖。** 页面、JavaScript 和 WASM 引擎打包在一个 HTML 中。Windows 提供双击启动脚本。

## 能做什么

- 在 **−12 到 +12 半音**之间转调，速度固定为 1.00×。
- 使用 **Rubber Band R3** 离线引擎，始终启用共振峰保留。
- 载入或拖入本地音乐，查看波形，切换原曲与转调结果对比试听。
- 导出 **48 kHz、24-bit PCM WAV**，保留解码后的时长与声道数。
- 内置合成旋律，无需准备文件即可试用。
- 在后台 Worker 中处理，显示进度，支持取消。

> 音色保留是对频谱包络的补偿，不是“完全不变”的保证。大幅转调或复杂混音仍可能有失真，建议先试听再导出。

## 快速开始

### 在线使用

**[打开音乐转调工具 →](https://seedgegei.github.io/music-gay/)**

使用新版 Edge 或 Chrome 打开即可，无需安装 Python。页面由 GitHub Pages 提供，音乐仍只在你的浏览器中处理，不会上传。首次打开需要网络加载程序。

### Windows：下载后双击

1. 点击仓库 **Code → Download ZIP**，解压到本地文件夹。
2. 安装 [Python 3](https://www.python.org/downloads/)（3.10 或以上），并启用 Python Launcher 或将 Python 加入 PATH。
3. 双击 **`启动音乐转调.cmd`**，程序优先使用 Edge 打开本机地址。
4. 选择音乐 → 设置半音数 → 生成转调音频 → 试听 → 下载 WAV。

仓库已包含可运行的 `dist/index.html`，**仅使用程序不需要 Node.js，也不需要安装 Python 第三方包**。

### 命令行

```bash
git clone https://github.com/seedgegei/music-gay.git
cd music-gay
python music_transposer_server.py
```

macOS / Linux 可将 `python` 替换为 `python3`。这些平台使用系统默认浏览器；Windows 优先使用 Edge。

服务器只监听 `127.0.0.1`，默认地址为 `http://127.0.0.1:18765/`。端口被占用时自动选择空闲端口，以启动器输出为准。

```bash
# 只启动，不自动打开浏览器
python music_transposer_server.py --no-browser

# 指定端口
python music_transposer_server.py --port 18888
```

也可以直接打开 `dist/index.html`。如果浏览器的本地文件策略阻止音频引擎，请使用上面的本机启动方式，不需要关闭浏览器安全设置。

## 文件格式与大小

| 项目 | 当前支持 |
|---|---|
| 输入 | 浏览器能够解码的 MP3、WAV、FLAC、M4A、OGG、AAC 等 |
| 限制 | 单个文件不超过 100 MB、10 分钟，单声道或立体声 |
| 处理采样率 | 48 kHz；输入在解码时转换到这一采样率 |
| 导出 | WAV，24-bit 整数 PCM，48 kHz |
| 保护内容 | 不支持 DRM 保护的音频 |

**为什么导出的 WAV 比原文件大？** WAV PCM 不使用有损压缩。同样采样率、声道和时长下，24-bit 的体积是 16-bit 的 **1.5 倍**；从 MP3 导出 WAV 的增幅通常更大。文件变大不代表听感按比例提升，也不是共振峰保留必须付出的存储成本。当前界面尚未提供 16-bit 或 MP3 导出选项。

更多说明：[使用指南](docs/QUICKSTART.md) · [音频原理与限制](docs/AUDIO.md) · [故障排查](docs/TROUBLESHOOTING.md)

## 隐私与运行方式

- 所选音乐只进入当前浏览器内存；本地服务不接收音频上传。
- 转调、试听和导出在本机完成，没有分析追踪、账号系统或外部音频服务。
- 刷新或关闭页面后，当前音乐和处理结果不会保存；下载的文件由浏览器保存。
- 本地后台服务运行八小时后退出；再次运行启动脚本即可重启。它不会安装开机自启动。
- README 徽章、Python 下载和上游项目链接需要网络；应用处理音频本身无需网络。

## 开发与验证

需要 **Node.js 22+** 和 **Python 3.10+**。应用依赖已随仓库提供，无需 `npm install`。

```bash
node scripts/build.mjs
node scripts/check.mjs
node --test tests/audio.test.mjs tests/worker.test.mjs
python -m unittest discover -s tests -p "test_*.py" -v
python scripts/package.py
```

打包结果位于 `release/music-gay-1.0.0-portable.zip`，附 SHA-256 校验文件。GitHub Actions 在 Windows 和 Linux 上检查构建、音频引擎、Worker、本地启动器及打包流程，并上传便携包作为构建产物。**自动检查不代替真实浏览器的听感、交互或文件格式兼容性验证。**

推送到 `main` 后，以上检查全部通过才会将 `dist/` 部署到 GitHub Pages；Pull Request 只执行检查。也可以从 Actions → CI → Run workflow 手动重新发布 `main`。

```text
src/                          页面模板、样式、浏览器逻辑与音频处理
scripts/                      构建、语法检查、便携包打包
tests/                        音频、嵌入 Worker、本地服务与打包验证
vendor/rubberband/            固定版本引擎、校验值、许可、对应源码
dist/index.html               已构建的单文件程序
docs/                         使用、故障排查、音频与开发说明
music_transposer_server.py    仅监听本机的启动器
启动音乐转调.cmd               Windows 双击入口
```

详见 [开发文档](docs/DEVELOPMENT.md) 与 [贡献指南](CONTRIBUTING.md)。

## 许可

本项目使用 **GPL-2.0-only**，见 [LICENSE](LICENSE)。音频引擎使用 Echogarden 的 `@echogarden/rubberband-wasm` 0.2.0 构建，底层为 Rubber Band。第三方版权、来源、固定提交与对应源码见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。引擎源码包也嵌入页面，可在“关于音频引擎”中下载。
