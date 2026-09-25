// SPDX-License-Identifier: GPL-2.0-only
'use strict';
const $ = id => document.getElementById(id);
const state = { input: null, output: null, wav: null, pitch: 0, resultPitch: null, filename: '', context: null, source: null, playing: false, position: 0, startedAt: 0, mode: 'original', worker: null, workerUrl: null, busy: false, loading: false, loadId: 0, jobId: 0, playId: 0 };
const stamp = seconds => { seconds = Math.max(0, Math.floor(seconds || 0)); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); };
const signed = value => value > 0 ? '+' + value : String(value);
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function validResult() { return state.output && state.resultPitch === state.pitch; }
function controls() {
  const loaded = !!state.input && !state.loading;
  $('render').disabled = !loaded || state.busy;
  $('render').innerHTML = state.busy ? '正在处理…' : validResult() ? '重新生成 <span aria-hidden="true">↗</span>' : '生成转调音频 <span aria-hidden="true">↗</span>';
  $('play').disabled = !loaded;
  $('seek').disabled = !loaded;
  $('download').disabled = !validResult() || state.busy || state.loading;
  $('processed').disabled = !validResult() || state.loading;
  $('original').disabled = !loaded;
  $('cancel').hidden = !state.busy;
  $('progress-wrap').hidden = !state.busy;
  $('minus').disabled = state.pitch === -12;
  $('plus').disabled = state.pitch === 12;
}
function terminateWorker() {
  if (state.worker) state.worker.terminate();
  if (state.workerUrl) URL.revokeObjectURL(state.workerUrl);
  state.worker = null; state.workerUrl = null;
}
function cancelProcessing(message = '已取消。可以调整音高后重新生成。') {
  ++state.jobId; terminateWorker(); state.busy = false; controls(); status(message);
}
function invalidateResult() {
  if (state.mode === 'processed') switchMode('original');
  state.output = null; state.wav = null; state.resultPitch = null;
  $('export-info').textContent = 'WAV · 24-bit PCM · 保持原速与时长';
  $('filetag').textContent = '已载入';
  controls();
}
function setPitch(value) {
  const next = Math.max(-12, Math.min(12, Math.round(Number(value))));
  if (next === state.pitch) return;
  if (state.busy) cancelProcessing();
  state.pitch = next;
  $('pitch-value').textContent = signed(next);
  $('pitch-slider').value = next;
  $('pitch-slider').setAttribute('aria-valuetext', next ? (next > 0 ? '升高' : '降低') + Math.abs(next) + '个半音' : '原调');
  $('pitch-caption').textContent = (next > 0 ? '升调' : next < 0 ? '降调' : '原调') + ' · 半音';
  document.querySelectorAll('[data-pitch]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.pitch) === next)));
  invalidateResult();
  status(state.input ? '设置已更新，点击生成后试听。' : '先选择一首音乐，再生成转调音频。');
}
async function audioContext() {
  if (!state.context || state.context.state === 'closed') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('当前浏览器不支持音频处理，请使用新版 Chrome 或 Edge。');
    state.context = new AudioContextClass({sampleRate: 48000});
  }
  return state.context;
}
function chosenBuffer() { return state.mode === 'processed' && validResult() ? state.output : state.input; }
function position() { return state.playing ? Math.min(chosenBuffer().duration, state.position + state.context.currentTime - state.startedAt) : state.position; }
function stopPlayback(reset = false) {
  ++state.playId;
  if (state.playing) state.position = position();
  state.playing = false;
  if (state.source) { state.source.onended = null; try { state.source.stop(); } catch {} state.source.disconnect(); state.source = null; }
  if (reset) state.position = 0;
  $('play').textContent = '▶'; $('play').setAttribute('aria-label', '播放'); updateClock();
}
async function startPlayback() {
  if (!state.input || state.loading) return;
  const id = ++state.playId;
  try {
    const ctx = await audioContext(); await ctx.resume();
    if (id !== state.playId) return;
    const buffer = chosenBuffer();
    if (state.position >= buffer.duration - 0.02) state.position = 0;
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
    source.onended = () => { if (state.source === source) { state.position = buffer.duration; state.playing = false; state.source = null; source.disconnect(); $('play').textContent = '▶'; $('play').setAttribute('aria-label', '播放'); updateClock(); } };
    state.startedAt = ctx.currentTime; state.source = source; state.playing = true;
    source.start(0, state.position); $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', '暂停'); tick();
  } catch (error) { stopPlayback(); status('播放失败：' + error.message, true); }
}
function tick() { updateClock(); if (state.playing) requestAnimationFrame(tick); }
function updateClock() {
  const value = state.input ? position() : 0;
  $('current-time').textContent = stamp(value);
  const fraction = state.input ? Math.min(1, value / state.input.duration) : 0;
  $('seek').value = Math.round(fraction * 1000); $('playhead').style.left = fraction * 100 + '%';
  $('seek').setAttribute('aria-valuetext', stamp(value));
}
function switchMode(mode) {
  if (mode === 'processed' && !validResult()) return;
  const resume = state.playing; stopPlayback(); state.mode = mode;
  $('original').setAttribute('aria-pressed', String(mode === 'original'));
  $('processed').setAttribute('aria-pressed', String(mode === 'processed'));
  drawWave(); if (resume) startPlayback();
}
function drawWave() {
  const buffer = chosenBuffer(); if (!buffer || $('loaded').hidden) return;
  const canvas = $('wave'), box = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!box.width) return;
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const data = buffer.getChannelData(0), bars = Math.floor(box.width / 4), segment = data.length / bars;
  ctx.fillStyle = state.mode === 'processed' ? '#ffb66d' : '#9bb6b0';
  for (let bar = 0; bar < bars; bar++) {
    let peak = 0; const end = Math.min(data.length, Math.floor((bar + 1) * segment)), step = Math.max(1, Math.floor(segment / 100));
    for (let i = Math.floor(bar * segment); i < end; i += step) peak = Math.max(peak, Math.abs(data[i]));
    const height = Math.max(2, Math.min(1, peak) * box.height * .82);
    ctx.fillRect(bar * 4, (box.height - height) / 2, 2, height);
  }
}
function installBuffer(buffer, name, isDemo = false) {
  stopPlayback(true); invalidateResult(); state.input = buffer; state.filename = name; state.mode = 'original';
  $('filename').textContent = name; $('filename').title = name;
  $('filemeta').textContent = `${stamp(buffer.duration)} · ${(buffer.sampleRate / 1000).toFixed(1).replace('.0', '')} kHz · ${buffer.numberOfChannels === 1 ? '单声道' : '立体声'}${isDemo ? ' · 合成示例' : ''}`;
  $('dropzone').hidden = true; $('loaded').hidden = false; $('replace').hidden = false;
  $('duration').textContent = $('total-time').textContent = stamp(buffer.duration); $('middle-time').textContent = stamp(buffer.duration / 2);
  $('track-hint').textContent = '支持拖入文件，随时替换';
  $('original').setAttribute('aria-pressed', 'true'); $('processed').setAttribute('aria-pressed', 'false');
  status('音乐已载入。选择升降调幅度后，点击生成。'); controls(); drawWave(); updateClock();
}
async function loadFile(file) {
  if (!file) return;
  if (file.size > 100 * 1024 * 1024) { status('文件超过 100 MB，请选用较小的音乐文件。', true); return; }
  if (file.size === 0) { status('这个文件是空的，请重新选择。', true); return; }
  if (state.busy) cancelProcessing();
  stopPlayback(); const id = ++state.loadId; state.loading = true; controls(); status('正在读取音乐…');
  try {
    await audioContext();
    // Decoding into 48 kHz gives predictable playback and export without changing tempo.
    const decoder = new OfflineAudioContext(2, 1, 48000);
    const buffer = await decoder.decodeAudioData(await file.arrayBuffer());
    if (id !== state.loadId) return;
    if (buffer.duration > 600) throw new Error('音乐超过 10 分钟，请先截取需要转调的片段。');
    if (!buffer.length || buffer.numberOfChannels > 2) throw new Error('请选择单声道或立体声音乐。');
    state.loading = false; installBuffer(buffer, file.name);
  } catch (error) {
    if (id !== state.loadId) return;
    status(error.name === 'EncodingError' ? '无法解码这个文件。请尝试普通 MP3 或 WAV，受保护的音乐文件不能直接处理。' : error.message || '读取失败，请重试。', true);
  } finally { if (id === state.loadId) { state.loading = false; controls(); } }
}
async function loadDemo() {
  if (state.busy) cancelProcessing();
  ++state.loadId; state.loading = false;
  try {
    const ctx = await audioContext(), rate = 48000, seconds = 8;
    const buffer = ctx.createBuffer(2, rate * seconds, rate);
    const notes = [261.626,329.628,391.995,440,391.995,329.628,293.665,261.626];
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const t = i / rate, noteTime = t % 1, f = notes[Math.floor(t)], env = Math.min(1, noteTime / .025) * Math.exp(-noteTime * 2.8) * Math.min(1, (1 - noteTime) / .05);
        let value = 0;
        for (let h = 1; h <= 9; h++) value += Math.sin(2 * Math.PI * f * h * t + c * .03 * h) / (h * h);
        data[i] = value * env * .28 + Math.sin(2 * Math.PI * 130.813 * t) * .045 * Math.min(1, t * 10) * Math.min(1, (seconds - t) * 10);
      }
    }
    installBuffer(buffer, '午后旋律 · 合成示例.wav', true);
  } catch (error) { status(error.message, true); }
}
function renderAudio() {
  if (!state.input || state.busy || state.loading) return;
  if (state.mode === 'processed') switchMode('original');
  state.output = null; state.wav = null; state.busy = true;
  const job = ++state.jobId, pitch = state.pitch, sourceBuffer = state.input;
  $('progress').value = 0; status('正在准备音色保留引擎…'); controls();
  try {
    // Pre-adapted classic Worker sources keep playback independent of remote modules.
    const workerCode = ['engine-source', 'dsp-source', 'worker-source'].map(id => $(id).textContent).join('\n');
    state.workerUrl = URL.createObjectURL(new Blob([workerCode], {type:'text/javascript'}));
    const worker = state.worker = new Worker(state.workerUrl);
    worker.onmessage = ({data}) => {
      if (job !== state.jobId) return;
      if (data.type === 'progress') { $('progress').value = data.percent; status(data.stage + ' · ' + data.percent + '%'); }
      else if (data.type === 'error') { cancelProcessing(); status('处理失败：' + data.message, true); }
      else if (data.type === 'done') {
        try {
          const buffer = state.context.createBuffer(data.channels.length, data.channels[0].length, sourceBuffer.sampleRate);
          data.channels.forEach((ch, c) => buffer.copyToChannel(ch, c));
          state.output = buffer; state.wav = new Blob([data.wav], {type:'audio/wav'}); state.resultPitch = pitch;
          state.busy = false; terminateWorker(); controls(); switchMode('processed');
          $('filetag').textContent = '可试听';
          $('export-info').textContent = `WAV · 24-bit · ${sourceBuffer.sampleRate / 1000} kHz · ${signed(pitch)} 半音 · ${stamp(buffer.duration)}`;
          status(pitch === 0 ? '已生成原调版本。可试听或导出。' : '转调完成，已保留音色与原速。可对比试听。');
        } catch (error) { cancelProcessing(); status('无法载入处理结果：' + error.message, true); }
      }
    };
    worker.onerror = event => { if (job === state.jobId) { event.preventDefault(); cancelProcessing(); status('音频引擎启动失败。请用「启动音乐转调.cmd」打开程序后重试。', true); } };
    const wasm = Uint8Array.from(atob($('wasm-data').textContent.trim()), c => c.charCodeAt(0));
    const channels = Array.from({length:sourceBuffer.numberOfChannels}, (_, c) => sourceBuffer.getChannelData(c).slice());
    worker.postMessage({wasm, channels, rate:sourceBuffer.sampleRate, pitch}, [wasm.buffer, ...channels.map(c => c.buffer)]);
  } catch (error) { cancelProcessing(); status('无法开始处理：' + error.message, true); }
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$('choose').onclick = $('replace').onclick = () => $('file').click();
$('file').onchange = event => { loadFile(event.target.files[0]); event.target.value = ''; };
for (const name of ['dragenter', 'dragover']) document.addEventListener(name, event => { event.preventDefault(); if (!state.loading) $('dropzone').classList.add('drag'); });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('dropzone').classList.remove('drag'); });
document.addEventListener('drop', event => { event.preventDefault(); $('dropzone').classList.remove('drag'); if (event.dataTransfer.files.length > 1) status('请一次选择一首音乐。', true); else loadFile(event.dataTransfer.files[0]); });
$('minus').onclick = () => setPitch(state.pitch - 1); $('plus').onclick = () => setPitch(state.pitch + 1);
$('reset').onclick = () => setPitch(0); $('pitch-slider').oninput = event => setPitch(event.target.value);
document.querySelectorAll('[data-pitch]').forEach(button => button.onclick = () => setPitch(button.dataset.pitch));
$('play').onclick = () => state.playing ? stopPlayback() : startPlayback();
$('original').onclick = () => switchMode('original'); $('processed').onclick = () => switchMode('processed');
$('seek').oninput = event => { const value = Number(event.target.value), resume = state.playing; stopPlayback(); if (state.input) state.position = value / 1000 * state.input.duration; updateClock(); if (resume) startPlayback(); };
$('demo').onclick = loadDemo; $('render').onclick = renderAudio; $('cancel').onclick = () => cancelProcessing();
$('download').onclick = () => { if (!validResult() || !state.wav) return; const base = state.filename.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'); saveBlob(state.wav, `${base}_${signed(state.pitch)}半音_保留音色.wav`); status('WAV 已开始下载。'); };
$('about').onclick = () => $('about-dialog').showModal(); $('close-about').onclick = () => $('about-dialog').close();
$('license-download').onclick = event => { event.preventDefault(); saveBlob(new Blob([$('license-text').textContent], {type:'text/plain'}), 'COPYING.txt'); };
$('source-download').onclick = event => { event.preventDefault(); const bytes = Uint8Array.from(atob($('source-archive').textContent.trim()), c => c.charCodeAt(0)); saveBlob(new Blob([bytes], {type:'application/gzip'}), 'rubberband-source.tar.gz'); };
new ResizeObserver(drawWave).observe($('wave'));
window.addEventListener('pagehide', () => { stopPlayback(); terminateWorker(); state.context?.close(); });
controls();
