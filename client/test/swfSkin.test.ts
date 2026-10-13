/**
 * The SWF reader against the shipped interface movies.
 *
 * Needs game data and therefore skips on a clean checkout, the same way
 * `realPacks.test.ts` does: `UBIQUITOUS_PACK=/path/to/res.bin`, `UBIQUITOUS_IPA` is not
 * needed, or leave a res.bin under `.cache/` or `work/cache/`.
 *
 * No assertion here quotes anything from the game: only counts, dimensions
 * and tag codes, which are facts about the reader rather than about the art.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { type ByteSource } from '../src/assets/vfs/ByteSource';
import { PackReader } from '../src/assets/vfs/zip';
import { parseSwf } from '../src/assets/formats/swf';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function findPack(name: string): string | null {
  const explicit = (process.env.UBIQUITOUS_PACK ?? '').trim();
  if (explicit && existsSync(explicit)) {
    const sibling = join(dirname(resolve(explicit)), name);
    if (existsSync(sibling)) return sibling;
  }
  const found: string[] = [];
  for (const base of [join(ROOT, '.cache'), join(ROOT, 'work', 'cache')]) {
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base)) {
      const p = join(base, dir, name);
      if (existsSync(p)) found.push(p);
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => statSync(b).size - statSync(a).size || a.localeCompare(b));
  return found[0];
}

const RES = findPack('res.bin');
const handles: { close(): Promise<void> }[] = [];

async function fileSource(path: string): Promise<ByteSource> {
  const handle = await open(path, 'r');
  handles.push(handle);
  const { size } = await handle.stat();
  return {
    size,
    async read(offset, length) {
      const buf = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buf, 0, length, offset);
      return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
    },
  };
}

afterAll(async () => {
  await Promise.all(handles.map(h => h.close()));
});

/** Tag codes present anywhere in a movie, without parsing tag bodies. */
function tagCodes(data: Uint8Array, start: number, end: number, into: Set<number>): void {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = start;
  while (pos + 2 <= end) {
    const head = dv.getUint16(pos, true);
    pos += 2;
    const code = head >> 6;
    let length = head & 0x3f;
    if (length === 0x3f) {
      length = dv.getUint32(pos, true);
      pos += 4;
    }
    into.add(code);
    if (code === 0) return;
    pos += length;
  }
}

describe.skipIf(!RES)('ui/*.swf, the shipped ones', () => {
  it('parses all three interface movies', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    for (const movie of ['ui/IGM.swf', 'ui/LGM.swf', 'ui/store.swf']) {
      const bytes = await pack.read(movie);
      const swf = await parseSwf(bytes);
      expect(swf.version).toBeGreaterThanOrEqual(6);
      expect(swf.width).toBeGreaterThan(0);
      expect(swf.height).toBeGreaterThan(0);
      expect(swf.exports.length).toBeGreaterThan(0);
      expect(swf.shapes.length).toBeGreaterThan(0);
      expect(swf.sprites.length).toBeGreaterThan(0);
    }
  });

  it('finds a silk library: hundreds of shapes, sprites and text fields', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const swf = await parseSwf(await pack.read('ui/IGM.swf'));
    // The in-game interface movie is an asset library, not an animation:
    // one frame on the root, hundreds of exports, shapes, sprites and
    // edit-texts, each wired to interface code by instance name.
    expect(swf.root.length).toBeLessThanOrEqual(2);
    expect(swf.exports.length).toBeGreaterThan(300);
    expect(swf.shapes.length).toBeGreaterThan(500);
    expect(swf.sprites.length).toBeGreaterThan(500);
    expect(swf.edits.length).toBeGreaterThan(500);
    const named = swf.root
      .flat()
      .concat(swf.sprites.flatMap(s => s.frames.flat()))
      .filter(p => p.name).length;
    expect(named).toBeGreaterThan(1000);
  });

  it('carries no ActionScript: rendering needs no script runtime', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    for (const movie of ['ui/IGM.swf', 'ui/LGM.swf', 'ui/store.swf']) {
      const bytes = await pack.read(movie);
      expect(bytes[0]).toBe(0x46); // FWS: uncompressed, parseable directly
      const codes = new Set<number>();
      // Body starts past the 8-byte header; CWS would need inflating first.
      tagCodes(bytes, 8, bytes.length, codes);
      expect(codes.has(12)).toBe(false); // DoAction
      expect(codes.has(59)).toBe(false); // DoInitAction
      expect(codes.has(82)).toBe(false); // DoABC
    }
  });

  it('resolves an interface icon to a real PNG', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    // Pick by position, not by name: the test must not quote the art.
    const candidate = pack.entries.find(
      e => e.name.startsWith('ui/icons/') && e.name.endsWith('.png') && !e.name.endsWith('_2X.png'),
    );
    expect(candidate).toBeDefined();
    const bytes = await pack.read(candidate!);
    // A PNG header carries its own dimensions; pixel decoding belongs to
    // the browser (`decodeTextureBitmap`), which Node has no stand-in for.
    expect(bytes[0]).toBe(0x89);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(16)).toBeGreaterThan(0);
    expect(view.getUint32(20)).toBeGreaterThan(0);
  });
});
