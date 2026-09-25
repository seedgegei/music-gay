// SPDX-License-Identifier: GPL-2.0-only
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Test precisely the script and WASM bytes embedded in the distributed HTML.
const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const embedded = id => {
  const result = html.match(new RegExp(`<script id="${id}" type="text/plain">([\\s\\S]*?)<\\/script>`));
  assert.ok(result, `Missing ${id}`);
  return result[1];
};
const worker = ['engine-source', 'dsp-source', 'worker-source'].map(embedded).join('\n');
const wasm = Buffer.from(embedded('wasm-data').trim(), 'base64');

async function run(channels, pitch) {
  const messages = [];
  const self = { location: { href: 'blob:http://localhost/test-worker' }, postMessage: data => messages.push(data) };
  const context = vm.createContext({ self, URL, WebAssembly, TextDecoder, TextEncoder, console,
    setTimeout, clearTimeout, performance,
    importScripts: () => { throw new Error('Unexpected network dependency'); } });
  vm.runInContext(worker, context);
  await self.onmessage({ data: { wasm, channels, rate: 48000, pitch } });
  return messages;
}

test('packaged worker loads embedded WASM, shifts, reports progress and encodes WAV', async () => {
  const frames = 48000 * 2;
  const input = Float32Array.from({ length: frames }, (_, i) => .25 * Math.sin(2 * Math.PI * 440 * i / 48000));
  const messages = await run([input], 2);
  assert.equal(messages.find(message => message.type === 'error'), undefined);
  const result = messages.find(message => message.type === 'done');
  assert.ok(result);
  assert.equal(result.channels[0].length, frames);
  assert.equal(new DataView(result.wav).getUint32(24, true), 48000);
  assert.ok(messages.some(message => message.type === 'progress' && message.percent === 100));
});

test('packaged worker reports invalid input without returning an incomplete WAV', async () => {
  const messages = await run([], 2);
  assert.ok(messages.some(message => message.type === 'error'));
  assert.ok(!messages.some(message => message.type === 'done'));
});
