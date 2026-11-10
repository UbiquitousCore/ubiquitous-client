/**
 * The table layouts, against the player's own builds: every table a build
 * ships is in a format its layout was measured against, and what the
 * layouts name reads as the thing it is called.
 *
 * Needs game data and skips without it: `.cache/<build>/tables.bin`, or
 * `UBIQUITOUS_PACK=/path/to/tables.bin`. Nothing here quotes the builds.
 */

import { existsSync, openAsBlob, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  type ColumnLayout,
  type ColumnSpec,
  resolveLayout,
} from '../src/assets/formats/columnLayout';
import { FTable } from '../src/assets/formats/ftable';
import { TABLE_LAYOUTS } from '../src/assets/formats/tableLayouts';
import { WorldTables } from '../src/assets/formats/tables';
import { PackReader } from '../src/assets/vfs/zip';

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
  return [...found].filter(dir => existsSync(join(dir, 'tables.bin')));
}

async function open(dir: string): Promise<PackReader> {
  const file = new File([await openAsBlob(join(dir, 'tables.bin'))], 'tables.bin');
  return PackReader.open(
    {
      size: file.size,
      read: async (offset, length) =>
        new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
    },
    'tables.bin',
  );
}

const BUILDS = builds();

describe.skipIf(BUILDS.length === 0)('the table layouts, in the user builds', () => {
  it.each(BUILDS)(
    'know the format of every table %s ships',
    async dir => {
      const pack = await open(dir);
      const strangers: string[] = [];
      for (const layout of Object.values(TABLE_LAYOUTS)) {
        const entry = pack.get(`tables/${layout.table}.tbl`);
        if (!entry) continue;
        const format = new FTable(await pack.read(entry)).format;
        const resolved = resolveLayout(layout as ColumnLayout<Record<string, ColumnSpec>>, format);
        if (!resolved.known) strangers.push(`${layout.table}: ${format}`);
      }
      expect(strangers).toEqual([]);
    },
    60_000,
  );

  it.each(BUILDS)(
    'read what they name out of %s',
    async dir => {
      const pack = await open(dir);
      const read = async (entry: string): Promise<Uint8Array | null> => {
        const found = pack.get(entry);
        return found ? pack.read(found) : null;
      };
      const tables = await WorldTables.load(read);
      const strings = async (name: string): Promise<Map<number, string>> =>
        tables.setStrings(name, new FTable((await read(`tables/${name}.tbl`))!));

      const maps = tables.maps();
      expect(maps.every(map => /\.wld$/i.test(map.world))).toBe(true);

      const zones = tables.zones(await strings('String_Zones_en'));
      expect(zones.length).toBeGreaterThan(50);
      expect(zones.some(zone => /\.bdae$/i.test(zone.skybox))).toBe(true);
      expect(zones.some(zone => /\.(tga|png)$/i.test(zone.icon))).toBe(true);

      // A talent names exactly as many rank spells as it has ranks, and each is a spell.
      const { places, trees } = tables.talents();
      expect(places.length).toBeGreaterThan(100);
      expect(trees.some(tree => tree.trees.length > 0)).toBe(true);
      const spells = tables.keyedRows('spell_new');
      for (const place of places) {
        expect(place.spells.length, `talent ${place.id}`).toBe(place.ranks);
        for (const spell of place.spells) expect(spells.has(spell), `spell ${spell}`).toBe(true);
      }
      expect(places.filter(place => /\.(tga|png)$/i.test(place.icon)).length).toBeGreaterThan(
        places.length / 2,
      );

      // Most spells are named, many pictured, and they point at effect rows that exist.
      const spellNames = await strings('String_Spell_en');
      const ids = [...spells.keys()];
      const named = ids.filter(id => spellNames.has(tables.spellNameId(id) ?? -1));
      expect(named.length).toBeGreaterThan(ids.length * 0.8);
      expect(ids.filter(id => tables.spellIcon(id)).length).toBeGreaterThan(ids.length / 4);
      const effects = tables.keyedRows('spell_effect');
      const slots = tables.columns.spells.effects;
      const pointing = ids.flatMap(id =>
        slots.map(at => Number(spells.get(id)![at])).filter(Boolean),
      );
      expect(pointing.filter(id => effects.has(id)).length).toBeGreaterThan(pointing.length * 0.95);

      // Most items are named, and what they describe themselves with is a string.
      const itemNames = await strings('String_Item_en');
      const items = tables.itemNames();
      expect(items.filter(item => itemNames.has(item.nameId)).length).toBeGreaterThan(
        items.length * 0.9,
      );
      const worn = items
        .map(item => tables.itemFacts(item.entry)!)
        .filter(facts => facts.inventoryType);
      expect(worn.length).toBeGreaterThan(500);
      expect(worn.every(facts => facts.inventoryType < 64 && facts.quality < 16)).toBe(true);
      expect(worn.some(facts => facts.damage.length > 0 && facts.delay > 0)).toBe(true);
      expect(worn.some(facts => facts.stats.length > 0)).toBe(true);

      // Nearly every placed creature has a model to draw.
      const { creatureSpawns } = tables.columns;
      const placed = tables.rowsOf('creature_spawns').map(row => Number(row[creatureSpawns.entry]));
      const drawn = placed.filter(entry => tables.creatureModel(entry).path);
      expect(drawn.length).toBeGreaterThan(placed.length * 0.9);

      const cues = tables.soundCatalogue().cues;
      expect(cues.length).toBeGreaterThan(100);
      expect(cues.some(cue => cue.music)).toBe(true);
    },
    120_000,
  );
});
