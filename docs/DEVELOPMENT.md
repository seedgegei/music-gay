# 开发与维护

## 环境

- Node.js 22+：构建和音频验证，使用内置模块。
- Python 3.10+：启动器、便携包和服务验证，使用标准库。
- 无 npm 或 pip 依赖安装步骤，不需要 API Key 或 `.env`。

仓库内已固定并分发音频引擎；不要将开发流程改成运行时从 CDN 下载引擎。

## 从源码构建

```bash
node scripts/build.mjs
node scripts/check.mjs
node --test tests/audio.test.mjs tests/worker.test.mjs
python -m unittest discover -s tests -p "test_*.py" -v
```

`build.mjs` 首先验证 vendor 校验值，再将 `src/` 文件、引擎、WASM、许可和对应源码嵌入 `dist/index.html`。路径通过 `fileURLToPath()` 解析，支持 Windows 盘符、中文和空格。构建不需要联网。

`dist/index.html` 被 Git 跟踪，方便用户直接下载运行。编辑源码后请重新构建并一并提交；CI 会重新构建并检查生成文件是否一致。不要直接手改 `dist/index.html`。

## Worker 约定

`src/worker.js` 在独立的经典 Worker 内执行。构建时将引擎包装器中的 `import.meta.url` 替换为 `self.location.href`，移除顶层导出；原始 vendor JS 保持不变。WASM 二进制通过消息传入，不进行资源请求。

输入消息包含 `channels`、`rate`、`pitch` 与 `wasm`。返回 `progress`、`done` 或 `error`；完成后使用 transferable ArrayBuffer 传回 PCM 和 WAV。取消时销毁 Worker，避免阻塞界面。

`tests/worker.test.mjs` 读取生成 HTML 中的真实脚本与 WASM，在隔离上下文中运行，检查完成和错误路径。它不模拟真实浏览器的解码、播放和下载，应另行人工检查。

## 便携包

```bash
python scripts/package.py
```

输出目录 `release/` 不提交到 Git。ZIP 含中文 HTML、Windows 启动脚本、Python 启动器、使用说明、许可、第三方说明与对应引擎源码。ZIP 文件顺序、时间戳与权限固定，便于相同工具链下重复构建；附带 SHA-256 校验文件。

包版本来自 `package.json`。更新版本时同步 `CHANGELOG.md` 与 README 中的包名。CI 会上传便携包；维护者可从成功的 Actions 运行中下载。

## GitHub Pages 发布

在线地址：<https://seedgegei.github.io/music-gay/>。

仓库 Settings → Pages → Build and deployment → Source 使用 **GitHub Actions**。`.github/workflows/ci.yml` 在 `main` 的 Windows 和 Linux 检查全部通过后，发布已验证与源码一致的 `dist/`。Pull Request 不会触发部署。

页面是单文件应用，资源均内嵌，不需要配置 `/music-gay/` 资源前缀或运行 Python 服务。Pages 只提供静态页面，音频处理和导出仍发生在访问者的浏览器中。

发布使用 `github-pages` environment；只有部署 job 获得 `pages: write` 和 `id-token: write` 权限，Actions 固定到提交 SHA。同一时间只运行一个部署，新的推送不会中断进行中的发布。需要手动重新发布时，从 Actions → CI → Run workflow 选择 `main`。

排查部署时先查看 CI 中的 **Deploy GitHub Pages** job，再确认 Pages 的 Source 和 environment 分支限制允许 `main`。仅 `dist/` 会成为网站内容，本地启动器和仓库文档不会作为网站文件上传。

## 发布前的人工检查

1. 在 Edge / Chrome 使用本机启动器打开。
2. 示例生成、原曲/结果试听切换、拖动进度正常。
3. 验证 WAV 和至少一种有损编码文件的导入。
4. 修改音高、取消处理、更换文件后，旧结果不应继续被当作当前结果导出。
5. 下载的 WAV 可在其他播放器中打开，声道与时长符合预期。
6. 检查窄屏和键盘操作，确保提示可读。

不要在公开仓库中上传用户音乐来复现问题；优先使用内置合成示例或自行生成的测试信号。

## 引擎升级

核实上游版本、许可、构建方式和源代码提交；更新 vendor 二进制、对应源码包、`SHA256SUMS` 与第三方声明。音频、Worker、短片段和便携包检查全部通过后，再做真实歌曲试听。当前构建引擎所需的 Emscripten Makefile 已包含在源码包中；本仓库日常构建只嵌入已校验的引擎，不重编译 C++。
