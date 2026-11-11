import { describe, expect, it } from 'vitest';

import {
  defineLayout,
  LayoutError,
  locate,
  may,
  must,
  resolveLayout,
  run,
} from '../src/assets/formats/columnLayout';
import { TABLE_LAYOUTS } from '../src/assets/formats/tableLayouts';

const layout = defineLayout(
  'example',
  'uufuuus',
  { id: must(0, 'uk'), weight: may(2, 'f'), slots: run([3, 4, 5], 'u'), label: may(6, 's') },
  [
    { format: 'ufuuus', edits: [{ lacks: 1 }] },
    { format: 'uuifuuus', edits: [{ addsBefore: 2 }] },
    { format: 'uufuuuu', own: { label: may(6, 'u') } },
  ],
);

describe('a column layout', () => {
  it('reads the reference format where each column is declared', () => {
    const resolved = resolveLayout(layout, 'uufuuus');
    expect(resolved.columns).toEqual({ id: 0, weight: 2, slots: [3, 4, 5], label: 6 });
    expect(resolved.known).toBe(true);
    expect(resolved.notes).toEqual([]);
  });

  it('moves everything after a column a format lacks down', () => {
    expect(resolveLayout(layout, 'ufuuus').columns).toEqual({
      id: 0,
      weight: 1,
      slots: [2, 3, 4],
      label: 5,
    });
  });

  it('moves everything after a column a format adds up', () => {
    expect(resolveLayout(layout, 'uuifuuus').columns.slots).toEqual([4, 5, 6]);
  });

  it('lets a format hold a column as another type', () => {
    const resolved = resolveLayout(layout, 'uufuuuu');
    expect(resolved.columns.label).toBe(6);
    expect(resolved.notes).toEqual([]);
  });

  it('leaves columns past a known format unread, and says so', () => {
    const resolved = resolveLayout(layout, 'uufuuusuu');
    expect(resolved.known).toBe(false);
    expect(resolved.columns.label).toBe(6);
    expect(resolved.notes[0]).toContain('2 column(s)');
  });

  it('keeps only the columns whose type still agrees in an unknown format', () => {
    const resolved = resolveLayout(layout, 'uuuuuuu');
    expect(resolved.columns).toEqual({ id: 0, weight: -1, slots: [3, 4, 5], label: -1 });
    expect(resolved.notes.some(note => note.includes("'weight'"))).toBe(true);
  });

  it('reads a run whole or not at all', () => {
    expect(resolveLayout(layout, 'uufuufs').columns.slots).toEqual([]);
  });

  it('refuses a table whose required column is another type', () => {
    expect(() => resolveLayout(layout, 'sufuuus')).toThrow(LayoutError);
  });
});

/** A number, a float or a string: what a kept column must still be. */
const kind = (type: string): string => (type === 'f' || type === 's' ? type : 'n');

describe('the table layouts', () => {
  const revisions = Object.values(TABLE_LAYOUTS).flatMap(known =>
    known.revisions.map(revision => ({ table: known.table, reference: known.reference, revision })),
  );

  it.each(revisions)(
    '$table: the edits for $revision.format account for it',
    ({ reference, revision }) => {
      const edits = revision.edits ?? [];
      let kept = 0;
      for (let column = 0; column < reference.length; column++) {
        const place = locate(edits, column);
        if (place < 0) continue;
        kept++;
        expect(place).toBeLessThan(revision.format.length);
        expect(kind(revision.format[place]!)).toBe(kind(reference[column]!));
      }
      const added = edits.reduce(
        (sum, edit) => sum + ('addsBefore' in edit ? (edit.count ?? 1) : 0),
        0,
      );
      expect(kept + added).toBe(revision.format.length);
    },
  );

  it('reads a 2.2.0 talent row five columns to a rank', () => {
    const talents = TABLE_LAYOUTS.talents;
    const later = talents.revisions.at(-1)!.format;
    const columns = resolveLayout(talents, later).columns;
    expect(columns.spells).toEqual([9, 14, 19, 24, 29]);
    expect(columns.icon).toBe(34);
    expect(later[columns.icon]).toBe('s');
  });

  it('finds no sun or halo in the oldest zones, and the glyph after the hill', () => {
    const zones = TABLE_LAYOUTS.zones;
    const columns = resolveLayout(zones, zones.revisions[0]!.format).columns;
    expect([columns.skyDome, columns.skyHill, columns.skySun, columns.skyHalo]).toEqual([
      20, 21, -1, -1,
    ]);
    expect(columns.icon).toBe(22);
  });
});
