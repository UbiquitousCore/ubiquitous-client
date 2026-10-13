/**
 * List resource paths in an .ipa or extracted pack, through the client's own
 * `Library`/`PackReader`. Only packs named with `--pack` are extracted.
 *
 *   UBIQUITOUS_IPA=/path/to/game.ipa npx tsx client/dev/searchAssets.ts <pattern> [options]
 *   UBIQUITOUS_PACK=/path/to/res.bin npx tsx client/dev/searchAssets.ts <pattern> [options]
 *
 *   --pack <name>   search only this pack (repeatable). Default: res.bin
 *   --regex         treat <pattern> as a regular expression
 *   --list-packs    print every pack name and exit
 *   --nodes <path>  print one .bdae's node names instead of searching
 */

import { existsSync, openAsBlob } from 'node:fs';
import { basename } from 'node:path';

import { Library } from '../src/assets/vfs/Library';
import { readBdae } from '../src/assets/providers/localModel';

async function nodeFile(path: string): Promise<File> {
  const blob = await openAsBlob(path);
  return new File([blob], basename(path));
}

async function mount(): Promise<Library> {
  const ipaPath = (process.env.UBIQUITOUS_IPA ?? '').trim();
  const packPath = (process.env.UBIQUITOUS_PACK ?? '').trim();

  if (ipaPath) {
    if (!existsSync(ipaPath)) throw new Error(`UBIQUITOUS_IPA does not exist: ${ipaPath}`);
    return Library.mount(await nodeFile(ipaPath));
  }
  if (packPath) {
    if (!existsSync(packPath)) throw new Error(`UBIQUITOUS_PACK does not exist: ${packPath}`);
    return Library.mountPack(await nodeFile(packPath));
  }
  throw new Error(
    'Set UBIQUITOUS_IPA=/path/to/game.ipa or UBIQUITOUS_PACK=/path/to/res.bin. ' +
      'Never commit either — see AGENTS.md "No hardcoded paths, ever".',
  );
}

function parseArgs(argv: string[]): {
  pattern: string;
  packs: string[];
  regex: boolean;
  listPacks: boolean;
  nodesOf: string | null;
} {
  const packs: string[] = [];
  let pattern = '';
  let regex = false;
  let listPacks = false;
  let nodesOf: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pack') packs.push(argv[++i]);
    else if (a === '--regex') regex = true;
    else if (a === '--list-packs') listPacks = true;
    else if (a === '--nodes') nodesOf = argv[++i];
    else if (!pattern) pattern = a;
  }
  return { pattern, packs: packs.length ? packs : ['res.bin'], regex, listPacks, nodesOf };
}

async function main(): Promise<void> {
  const { pattern, packs, regex, listPacks, nodesOf } = parseArgs(process.argv.slice(2));
  const lib = await mount();

  if (listPacks) {
    for (const name of lib.packNames()) console.log(name);
    return;
  }

  if (nodesOf) {
    const doc = await readBdae(lib, nodesOf);
    const names = [...doc.attachPoints().keys()].sort();
    console.log(`${nodesOf}: ${names.length} named nodes`);
    for (const name of names) console.log(`  ${name}`);
    return;
  }

  if (!pattern) {
    console.error('Usage: searchAssets.ts <pattern> [--pack name] [--regex] [--list-packs]');
    process.exitCode = 1;
    return;
  }

  const matcher = regex
    ? new RegExp(pattern, 'i')
    : { test: (s: string) => s.toLowerCase().includes(pattern.toLowerCase()) };

  for (const packName of packs) {
    if (!lib.hasPack(packName)) {
      console.error(`(no such pack in this build: ${packName})`);
      continue;
    }
    const reader = await lib.pack(packName);
    const hits = reader.entries.filter(e => matcher.test(e.name));
    console.log(`${packName}: ${hits.length} match(es) of ${reader.length} entries`);
    for (const hit of hits) console.log(`  ${hit.name}`);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

// Re-exported so a caller that already has a mounted Library (a REPL, a
// future test) can filter without shelling out.
export { parseArgs };
