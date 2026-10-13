/**
 * One-off check: what .beff format version does a given build ship?
 * Not part of the client: an ad-hoc measurement against local packs.
 *
 *   UBIQUITOUS_PACK=/path/to/res.bin npx tsx dev/checkBeffVersion.ts
 */
import { existsSync, openAsBlob } from 'node:fs';
import { basename } from 'node:path';
import { Library } from '../src/assets/vfs/Library';

async function nodeFile(path: string): Promise<File> {
  const blob = await openAsBlob(path);
  return new File([blob], basename(path));
}

async function main(): Promise<void> {
  const packPath = (process.env.UBIQUITOUS_PACK ?? '').trim();
  if (!packPath || !existsSync(packPath)) throw new Error('Set UBIQUITOUS_PACK=/path/to/res.bin');
  const lib = await Library.mountPack(await nodeFile(packPath));
  const reader = await lib.pack(basename(packPath));
  const beffEntries = reader.entries.filter(e => e.name.toLowerCase().endsWith('.beff'));
  console.log(`${beffEntries.length} .beff files found`);

  const counts = new Map<number, number>();
  const examples = new Map<number, string>();
  for (const entry of beffEntries) {
    const data = await reader.read(entry);
    if (data.length < 8) continue;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const version = view.getInt32(4, true);
    counts.set(version, (counts.get(version) ?? 0) + 1);
    if (!examples.has(version)) examples.set(version, entry.name);
  }
  console.log('version -> count (example file)');
  for (const [version, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${version} -> ${count}  (${examples.get(version)})`);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
