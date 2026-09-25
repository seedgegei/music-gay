// SPDX-License-Identifier: GPL-2.0-only
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const dir of ['src', 'scripts', 'tests']) {
  for (const name of fs.readdirSync(path.join(root, dir)).filter(name => /\.(mjs|js)$/.test(name))) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, dir, name)], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const appScripts = scripts.filter(([, attrs]) => !attrs.includes('text/plain'));
if (appScripts.length !== 1) throw new Error('Expected one inline app script');
new vm.Script(appScripts[0][2]);
if (/\b(?:src|href)=["']https?:/i.test(html.replace(/<a\b[^>]*>/g, ''))) {
  throw new Error('Unexpected external runtime resource');
}
console.log('JavaScript syntax and self-contained HTML checks passed.');
