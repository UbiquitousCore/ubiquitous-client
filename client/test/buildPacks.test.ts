/**
 * What a build's tables name, read out of that build's own packs: the
 * models its creatures and scenery wear, a spread of its pictures, a map's
 * ground and scenery, and its interface movies.
 *
 * Needs game data and skips without it: `.cache/<build>/res.bin` with
 * `tables.bin` beside it, or `UBIQUITOUS_PACK=/path/to/res.bin`. Nothing here
 * quotes the builds.
 */

import { existsSync, openAsBlob, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ResourceNotFoundError } from '../src/core/errors';
import { Bdae } from '../src/assets/formats/bdae';
import { parseSwf } from '../src/assets/formats/swf';
import { WorldTables } from '../src/assets/formats/tables';
import { parseItm, parseTrn } from '../src/assets/formats/terrain';
import { decodeTexture } from '../src/assets/formats/texture';
import { toModelData, toSkeletonData } from '../src/assets/providers/localModel';
import { PackReader, unwrapBdae } from '../src/assets/vfs/zip';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every build on disk, by the directory holding its packs. */
function builds(): string[] {
  const found = new Set<string>();
  const explicit = (process.env.UBIQUITOUS_PACK ?? '').trim();
  if (explicit && existsSync(explicit)) found.add(dirname(resolve(explicit)));
  const base = join(ROOT, '.cache');
  if (existsSync(base)) {
    for (const dir of readdirSync(base).sort()) found.add(join(base, dir));
  }
  return [...found].filter(
    dir => existsSync(join(dir, 'res.bin')) && existsSync(join(dir, 'tables.bin')),
  );
}

async function open(dir: string, name: string): Promise<PackReader | null> {
  if (!existsSync(join(dir, name))) return null;
  const file = new File([await openAsBlob(join(dir, name))], name);
  return PackReader.open(
    {
      size: file.size,
      read: async (offset, length) =>
        new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
    },
    name,
  );
}

/** Up to `most` of `all`, spread evenly through it. */
function spread<T>(all: readonly T[], most: number): T[] {
  const step = Math.max(1, Math.floor(all.length / most));
  return all.filter((_, i) => i % step === 0);
}

const BUILDS = builds();

describe.skipIf(BUILDS.length === 0)('a build, read from its own packs', () => {
  it.each(BUILDS)(
    '%s: draws the models its tables place',
    async dir => {
      const tablesPack = (await open(dir, 'tables.bin'))!;
      const tables = await WorldTables.load(async entry => {
        const found = tablesPack.get(entry);
        return found ? tablesPack.read(found) : null;
      });
      const packs = [await open(dir, 'res.bin'), await open(dir, 'res_t.bin')].filter(
        (pack): pack is PackReader => pack !== null,
      );
      const byName = new Map<string, { pack: PackReader; name: string }>();
      for (const pack of packs) {
        for (const entry of pack.entries) {
          const key = entry.name.toLowerCase();
          if (!byName.has(key)) byName.set(key, { pack, name: entry.name });
        }
      }

      const { creatureSpawns, staticSpawns } = tables.columns;
      const named = new Set<string>();
      for (const row of tables.rowsOf('creature_spawns')) {
        const path = tables.creatureModel(Number(row[creatureSpawns.entry])).path;
        if (path) named.add(path.toLowerCase());
      }
      for (const row of tables.rowsOf('staticobject_spawns')) {
        const path = tables.staticModel(Number(row[staticSpawns.entry])).path;
        if (path) named.add(path.toLowerCase());
      }
      expect(named.size).toBeGreaterThan(100);

      const shipped = [...named].filter(path => byName.has(path));
      expect(shipped.length).toBeGreaterThan(named.size * 0.9);

      const broken: string[] = [];
      let drawn = 0;
      for (const path of shipped) {
        const { pack, name } = byName.get(path)!;
        try {
          const doc = new Bdae((await unwrapBdae(await pack.read(name))).payload);
          toSkeletonData(doc, path);
          toModelData(doc, path, ref => byName.has(ref.toLowerCase()));
          drawn++;
        } catch (error) {
          // A marker or a collision-only shape is placed with nothing to draw.
          if (error instanceof ResourceNotFoundError) continue;
          broken.push(`${path}: ${String(error)}`);
        }
      }
      expect(broken).toEqual([]);
      expect(drawn).toBeGreaterThan(shipped.length * 0.95);
    },
    600_000,
  );

  it.each(BUILDS)(
    '%s: decodes a spread of its pictures',
    async dir => {
      const res = (await open(dir, 'res.bin'))!;
      const pictures = res.entries.filter(e => !e.isDir && /\.(tga|pvr)$/i.test(e.name));
      expect(pictures.length).toBeGreaterThan(100);
      const broken: string[] = [];
      for (const entry of spread(pictures, 200)) {
        try {
          const { info } = decodeTexture(await res.read(entry), 256);
          expect(info.width * info.height, entry.name).toBeGreaterThan(0);
        } catch (error) {
          broken.push(`${entry.name}: ${String(error)}`);
        }
      }
      expect(broken).toEqual([]);
    },
    300_000,
  );

  it.each(BUILDS)(
    '%s: reads a map’s ground and scenery',
    async dir => {
      const land = await open(dir, 'land1.bin');
      if (!land) return;
      const broken: string[] = [];
      const tiles = land.entries.filter(e => !e.isDir && /\.trn$/i.test(e.name));
      const scenery = land.entries.filter(e => !e.isDir && /\.itm$/i.test(e.name));
      expect(tiles.length).toBeGreaterThan(0);
      let placements = 0;
      for (const entry of spread(tiles, 100)) {
        try {
          expect(parseTrn(await land.read(entry)).chunks, entry.name).toHaveLength(64);
        } catch (error) {
          broken.push(`${entry.name}: ${String(error)}`);
        }
      }
      for (const entry of spread(scenery, 100)) {
        try {
          placements += parseItm(await land.read(entry)).count;
        } catch (error) {
          broken.push(`${entry.name}: ${String(error)}`);
        }
      }
      expect(broken).toEqual([]);
      expect(placements).toBeGreaterThan(0);
    },
    300_000,
  );

  it.each(BUILDS)(
    '%s: parses every interface movie it carries',
    async dir => {
      const res = (await open(dir, 'res.bin'))!;
      const movies = res.entries.filter(e => !e.isDir && /\.swf$/i.test(e.name));
      const broken: string[] = [];
      for (const entry of movies) {
        try {
          await parseSwf(await res.read(entry));
        } catch (error) {
          broken.push(`${entry.name}: ${String(error)}`);
        }
      }
      expect(broken).toEqual([]);
    },
    300_000,
  );
});
