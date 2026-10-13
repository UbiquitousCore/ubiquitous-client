#!/usr/bin/env node

/**
 * Measure production bundle composition from `dist/assets`.
 *
 * Run after `npm run build` (or use `npm run measure:bundle`).
 */

import { brotliCompressSync, gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'dist', 'assets');

function kb(bytes) {
  return (bytes / 1024).toFixed(2);
}

function measured(file) {
  const full = path.join(assets, file);
  const bytes = readFileSync(full);
  return {
    file,
    raw: statSync(full).size,
    gzip: gzipSync(bytes, { level: 9 }).length,
    br: brotliCompressSync(bytes).length,
  };
}

const files = readdirSync(assets).filter(name => /\.(js|css)$/i.test(name));
if (!files.length) {
  console.error('No .js or .css files found in dist/assets. Run npm run build first.');
  process.exit(1);
}

const rows = files.map(measured).sort((a, b) => b.raw - a.raw);
const entry = rows.find(row => /^index-.*\.js$/i.test(row.file)) ?? rows[0];

const totals = rows.reduce(
  (sum, row) => ({ raw: sum.raw + row.raw, gzip: sum.gzip + row.gzip, br: sum.br + row.br }),
  { raw: 0, gzip: 0, br: 0 },
);

console.log('\nBundle assets (.js/.css):');
for (const row of rows) {
  console.log(
    `${row.file.padEnd(34)} raw ${kb(row.raw).padStart(8)} KiB` +
      `  gzip ${kb(row.gzip).padStart(8)} KiB` +
      `  br ${kb(row.br).padStart(8)} KiB`,
  );
}

console.log('\nEntry chunk:');
console.log(
  `${entry.file}  raw ${kb(entry.raw)} KiB  gzip ${kb(entry.gzip)} KiB  br ${kb(entry.br)} KiB`,
);

console.log('\nTotals (.js/.css only):');
console.log(`raw ${kb(totals.raw)} KiB  gzip ${kb(totals.gzip)} KiB  br ${kb(totals.br)} KiB`);
