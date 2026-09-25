# 第三方组件与对应源码

## Rubber Band Library

- 作者：Chris Cannam；发布方 Particular Programs Ltd / Breakfast Quay。
- 对应源码版权：Copyright 2007–2024 Particular Programs Ltd。
- 上游项目：[Rubber Band](https://breakfastquay.com/rubberband/)。
- 此分发对应的源码提交：`a19a891b3619ecea00f5c402006fe95b9c4d8a7f`。
- 上游源码声明 GPL-2.0-or-later；本应用及所用 WASM 包按 GPL-2.0-only 分发。

## Echogarden WASM 构建

- 包：`@echogarden/rubberband-wasm`，版本 `0.2.0`。
- 维护方：Echogarden project。
- 许可：GPL-2.0-only，完整文本见 [LICENSE](LICENSE) 及 `vendor/rubberband/COPYING`。
- 仓库：[echogarden-project/rubberband-wasm](https://github.com/echogarden-project/rubberband-wasm)。
- 构建仓库提交：`988bbbf772c2d3762f419e1ce3600d6f290f3458`。
- 引擎二进制与 vendor JavaScript 未修改，SHA-256 见 `vendor/rubberband/SHA256SUMS`。

页面构建时对 JavaScript 包装器进行两处适配：将 `import.meta.url` 替换为 `self.location.href`，移除 `export default Rubberband`。适配发生在 `scripts/build.mjs`，用来在经典 Blob Worker 中载入内嵌 WASM；不修改 WASM 算法。

## 获取与构建对应源码

对应源码和构建资料位于 `vendor/rubberband/rubberband-source.tar.gz`，包含 Echogarden Makefile 与上述 Rubber Band 子模块源码，不包含 Git 凭据。页面中嵌入同一源码包，可在“关于音频引擎”下载；便携 ZIP 也携带该文件。

解压源码包后，在已配置 Emscripten 的环境中按所附 Makefile 运行 `make`。上游包未固定 Emscripten 版本，因此不宣称任意工具链重编译得到逐字节一致的 WASM；日常应用构建验证并嵌入仓库固定的二进制。

## 应用与测试资源

应用代码采用 GPL-2.0-only。示例旋律、正弦波和合成元音由程序生成；仓库不分发用户提供的歌曲、转调结果或分析报告。
