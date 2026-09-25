// SPDX-License-Identifier: GPL-2.0-only
// Rubberband, transpose and encodeWav are embedded before this handler at build time.
self.onmessage = async ({ data }) => {
  try {
    const engine = await Rubberband({
      wasmBinary: data.wasm,
      locateFile: () => 'rubberband.wasm',
      print: () => {},
      printErr: () => {},
    });
    const channels = transpose(engine, data.channels, data.rate, data.pitch,
      progress => self.postMessage({ type: 'progress', ...progress }));
    const wav = encodeWav(channels, data.rate);
    self.postMessage({ type: 'done', channels, wav }, [...channels.map(channel => channel.buffer), wav]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || '处理失败' });
  }
};
