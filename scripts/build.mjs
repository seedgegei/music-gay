// SPDX-License-Identifier: GPL-2.0-only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replaceAll('\r\n', '\n');
const vendor = path.join(root, 'vendor/rubberband');
for (const line of fs.readFileSync(path.join(vendor, 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/)) {
  const [expected, name] = line.trim().split(/\s+/);
  const actual = createHash('sha256').update(fs.readFileSync(path.join(vendor, name))).digest('hex');
  if (actual !== expected) throw new Error(`Vendor checksum mismatch: ${name}`);
}

// Convert the vendored ES module wrapper into a self-contained classic Worker.
// Keep the original vendor file intact; apply the adaptation only to generated output.
const originalEngine = fs.readFileSync(path.join(vendor, 'rubberband.js'), 'utf8');
if (!/export default Rubberband;\s*$/.test(originalEngine)) throw new Error('Unrecognized Rubber Band wrapper');
const engine = originalEngine.replaceAll('import.meta.url', 'self.location.href').replace(/export default Rubberband;\s*$/, '');
const parts = {
  STYLE: read('src/style.css'),
  APP: read('src/app.js'),
  DSP: read('src/dsp.mjs').replace(/^export /gm, ''),
  WORKER: read('src/worker.js'),
  ENGINE: engine,
  WASM: fs.readFileSync(path.join(vendor, 'rubberband.wasm')).toString('base64'),
  LICENSE: fs.readFileSync(path.join(vendor, 'COPYING'), 'utf8'),
  SOURCE_ARCHIVE: fs.readFileSync(path.join(vendor, 'rubberband-source.tar.gz')).toString('base64'),
};
let html = read('src/page.html');
for (const [marker, value] of Object.entries(parts)) {
  const placeholder = `/* ${marker} */`;
  if (html.split(placeholder).length !== 2) throw new Error(`Missing or duplicate placeholder: ${marker}`);
  if (/<\/script/i.test(value)) throw new Error(`Unsafe embedded script terminator: ${marker}`);
  html = html.replace(placeholder, () => value);
}
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), html);
console.log(`Built dist/index.html (${Buffer.byteLength(html)} bytes); vendor checksums verified.`);
