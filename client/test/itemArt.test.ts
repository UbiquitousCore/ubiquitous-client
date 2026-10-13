/**
 * An item's name and icon, out of the local game data.
 *
 * `items.tbl` names the string an item's name is read through and, for a
 * minority of entries, the display row their look actually lives under.
 * `itemdisplayinfo` is keyed by the item's own entry id for almost
 * everything else. Both a bag slot and a vendor listing go through these same
 * two lookups (`Game.resolveItemArt`, `onVendorItems`), so a gap here
 * shows up as a raw "Item <entry>" placeholder with no icon wherever a real
 * item is drawn.
 */

import { describe, expect, it } from 'vitest';

import { WorldTables } from '../src/assets/formats/tables';
import { buildTable, buildTableFiles } from './helpers/fixtures';

function loader(overrides: Array<{ name: string; data: Uint8Array }>) {
  const files = new Map(buildTableFiles().map(e => [e.name, e.data]));
  for (const override of overrides) files.set(override.name, override.data);
  return async (entry: string) => files.get(entry) ?? null;
}

/** `items.tbl`: id, class, subClass, nameTextId, displayInfoId. */
const ITEMS_FORMAT = 'uuuuu';
/** `itemdisplayinfo.tbl`: id, unused, unused, unused, unused, icon. */
const DISPLAY_FORMAT = 'uuuuus';

describe('an item name and icon', () => {
  it("resolves through the item's own entry id, the common case", async () => {
    const items = buildTable(ITEMS_FORMAT, [[10, 4, 4, 500, 10]], [10]);
    const display = buildTable(
      DISPLAY_FORMAT,
      [[10, 0, 0, 0, 0, 'icon_chain_waistcoat.png']],
      [10],
    );
    const tables = await WorldTables.load(
      loader([
        { name: 'tables/items.tbl', data: items },
        { name: 'tables/itemdisplayinfo.tbl', data: display },
      ]),
    );

    expect(tables.itemNameId(10)).toBe(500);
    expect(tables.itemIcon(10)).toBe('icon_chain_waistcoat.png');
  });

  it("falls back to items.tbl's own DisplayInfoId when the entry itself is not a display row", async () => {
    // Entry 11 carries no row of its own in itemdisplayinfo — its look is
    // catalogued only under display id 20, which items.tbl's own row names.
    const items = buildTable(ITEMS_FORMAT, [[11, 4, 4, 501, 20]], [11]);
    const display = buildTable(DISPLAY_FORMAT, [[20, 0, 0, 0, 0, 'icon_shared_mail.png']], [20]);
    const tables = await WorldTables.load(
      loader([
        { name: 'tables/items.tbl', data: items },
        { name: 'tables/itemdisplayinfo.tbl', data: display },
      ]),
    );

    expect(tables.itemNameId(11)).toBe(501);
    expect(tables.itemIcon(11)).toBe('icon_shared_mail.png');
  });

  it('prefers the direct entry match over the fallback when both exist', async () => {
    // A pathological row that also carries a DisplayInfoId pointing
    // elsewhere: the direct hit must win, or a well-formed item could be
    // mis-drawn as something else entirely.
    const items = buildTable(ITEMS_FORMAT, [[10, 4, 4, 500, 20]], [10]);
    const display = buildTable(
      DISPLAY_FORMAT,
      [
        [10, 0, 0, 0, 0, 'icon_own.png'],
        [20, 0, 0, 0, 0, 'icon_other.png'],
      ],
      [10, 20],
    );
    const tables = await WorldTables.load(
      loader([
        { name: 'tables/items.tbl', data: items },
        { name: 'tables/itemdisplayinfo.tbl', data: display },
      ]),
    );

    expect(tables.itemIcon(10)).toBe('icon_own.png');
  });

  it('answers null rather than throwing when neither lookup places the item', async () => {
    const items = buildTable(ITEMS_FORMAT, [[12, 4, 1, 0, 0]], [12]);
    const display = buildTable(DISPLAY_FORMAT, [[10, 0, 0, 0, 0, 'icon_a.png']], [10]);
    const tables = await WorldTables.load(
      loader([
        { name: 'tables/items.tbl', data: items },
        { name: 'tables/itemdisplayinfo.tbl', data: display },
      ]),
    );

    expect(tables.itemNameId(12)).toBeNull();
    expect(tables.itemIcon(12)).toBeNull();
    // An id no row anywhere carries — the miss path for an item this build's
    // tables have never heard of at all.
    expect(tables.itemNameId(999)).toBeNull();
    expect(tables.itemIcon(999)).toBeNull();
  });

  it('never loops the fallback back on the same entry it already missed on', async () => {
    // A row whose own DisplayInfoId names itself would otherwise repeat the
    // exact lookup that already missed above it.
    const items = buildTable(ITEMS_FORMAT, [[13, 4, 4, 502, 13]], [13]);
    const display = buildTable(DISPLAY_FORMAT, [[10, 0, 0, 0, 0, 'icon_a.png']], [10]);
    const tables = await WorldTables.load(
      loader([
        { name: 'tables/items.tbl', data: items },
        { name: 'tables/itemdisplayinfo.tbl', data: display },
      ]),
    );

    expect(tables.itemIcon(13)).toBeNull();
  });
});
