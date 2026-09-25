// Copyright 2026. This application is licensed under GPL-2.0-only.
// Offline Rubber Band R3 processing: fixed duration, formant preservation.
function validateAudio(channels, sampleRate) {
  if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2 || !channels[0]?.length) {
    throw new Error('请选择单声道或立体声音乐。');
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new Error('不支持这个采样率。');
  }
  const frames = channels[0].length;
  for (const channel of channels) {
    if (Object.prototype.toString.call(channel) !== '[object Float32Array]' || channel.length !== frames) {
      throw new Error('音频声道数据不完整。');
    }
    for (let i = 0; i < frames; i++) if (!Number.isFinite(channel[i])) throw new Error('音频包含无效采样。');
  }
  return frames;
}

export function transpose(m, channels, sampleRate, semitones, progress = () => {}, preserveFormants = true) {
  const frames = validateAudio(channels, sampleRate);
  if (!Number.isFinite(semitones) || Math.abs(semitones) > 12) throw new Error('转调范围为 -12 到 +12 半音。');
  if (semitones === 0) return channels.map(c => c.slice());
  const block = 4096;
  // Give the analysis window sufficient tail on very short clips; retain the original length.
  const processFrames = Math.max(frames, Math.ceil(sampleRate * .5));
  const flags = 0x20000000 | 0x10000000 | 0x00010000 | (preserveFormants ? 0x01000000 : 0);
  const state = m._rubberband_new(sampleRate, channels.length, flags, 1, 2 ** (semitones / 12));
  if (!state) throw new Error('音频引擎内存不足，请使用较短的音乐。');
  const allocations = [];
  const alloc = bytes => { const p = m._malloc(bytes); if (!p) throw new Error('音频内存不足。'); allocations.push(p); return p; };
  try {
    if (m._rubberband_get_engine_version(state) !== 3) throw new Error('音色保留引擎未能启动。');
    const pointers = alloc(channels.length * 4);
    const channelPtrs = channels.map(() => alloc(block * 4));
    channelPtrs.forEach((p, c) => { m.HEAPU32[(pointers >>> 2) + c] = p; });
    m._rubberband_set_expected_input_duration(state, processFrames);
    m._rubberband_set_max_process_size(state, block);
    const output = channels.map(() => new Float32Array(frames));
    let written = 0, lastPercent = -1;
    const report = (stage, value) => { const percent = Math.floor(value); if (percent !== lastPercent) { progress({stage, percent}); lastPercent = percent; } };
    for (let pass = 0; pass < 2; pass++) {
      for (let offset = 0; offset < processFrames; offset += block) {
        const count = Math.min(block, processFrames - offset);
        const final = offset + count === processFrames ? 1 : 0;
        channels.forEach((data, c) => {
          const start = channelPtrs[c] >>> 2;
          m.HEAPF32.fill(0, start, start + count);
          if (offset < frames) m.HEAPF32.set(data.subarray(offset, Math.min(frames, offset + count)), start);
        });
        if (pass === 0) m._rubberband_study(state, pointers, count, final);
        else {
          m._rubberband_process(state, pointers, count, final);
          let available;
          while ((available = m._rubberband_available(state)) > 0) {
            const received = m._rubberband_retrieve(state, pointers, Math.min(block, available));
            if (received <= 0) throw new Error('音频处理意外停止，请重新尝试。');
            const keep = Math.min(received, frames - written);
            if (keep > 0) channelPtrs.forEach((ptr, c) => output[c].set(m.HEAPF32.subarray(ptr >>> 2, (ptr >>> 2) + keep), written));
            written += keep;
          }
        }
        report(pass ? '正在保留音色并转调' : '正在分析音乐', pass ? 20 + 79 * (offset + count) / processFrames : 20 * (offset + count) / processFrames);
      }
    }
    if (written < frames) throw new Error('音频输出不完整，请重新尝试。');
    // Apply one uniform gain only if required to avoid clipping, keeping dynamics intact.
    let peak = 0;
    for (const ch of output) for (let i = 0; i < ch.length; i++) {
      if (!Number.isFinite(ch[i])) throw new Error('音频处理结果无效。');
      peak = Math.max(peak, Math.abs(ch[i]));
    }
    if (peak > 0.999) for (const ch of output) for (let i = 0; i < ch.length; i++) ch[i] *= 0.999 / peak;
    report('处理完成', 100);
    return output;
  } finally {
    m._rubberband_delete(state);
    allocations.forEach(p => m._free(p));
  }
}

export function encodeWav(channels, sampleRate) {
  const frames = validateAudio(channels, sampleRate), count = channels.length;
  const bytes = frames * count * 3;
  const pad = bytes % 2;
  const result = new ArrayBuffer(44 + bytes + pad), view = new DataView(result);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + bytes + pad, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * count * 3, true);
  view.setUint16(32, count * 3, true); view.setUint16(34, 24, true); text(36, 'data'); view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < count; c++) {
    const f = Math.max(-1, Math.min(1, channels[c][i]));
    const value = Math.round(f * (f < 0 ? 8388608 : 8388607));
    view.setUint8(offset++, value & 255); view.setUint8(offset++, (value >> 8) & 255); view.setUint8(offset++, (value >> 16) & 255);
  }
  return result;
}
