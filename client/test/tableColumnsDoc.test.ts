/**
 * `docs/formats/table-columns.md` is what the layouts and the column notes
 * say, and the notes speak only of columns some build has.
 *
 * `UPDATE_DOCS=1` writes the page instead of checking it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { COLUMN_NOTES } from '../dev/tableColumnNotes';
import {
  allLayouts,
  type ColumnId,
  columnsOfKey,
  renderTableColumns,
  variantsOf,
} from '../dev/tableColumns';
import { locate } from '../src/assets/formats/columnLayout';

const PAGE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'formats',
  'table-columns.md',
);

const label = (id: ColumnId): string => ('ref' in id ? `${id.ref}` : `${id.before}+${id.n}`);

describe('the table column page', () => {
  it('gives every build as many columns as its format has', () => {
    for (const layout of allLayouts()) {
      for (const variant of variantsOf(layout)) {
        expect(variant.columns.length, `${layout.table} ${variant.builds}`).toBe(
          variant.format.length,
        );
      }
    }
  });

  it('puts each 1.1.4 column where the client reads it', () => {
    for (const layout of allLayouts()) {
      const variants = variantsOf(layout).slice(1);
      layout.revisions.forEach((revision, i) => {
        const held = variants[i]!.columns.map(label);
        for (let ref = 0; ref < layout.reference.length; ref++) {
          expect(held.indexOf(`${ref}`), `${layout.table} ${revision.builds} column ${ref}`).toBe(
            locate(revision.edits ?? [], ref),
          );
        }
      });
    }
  });

  it('has notes only for columns some build holds, one note a column', () => {
    const tables = new Map(allLayouts().map(layout => [layout.table, layout]));
    for (const [table, notes] of Object.entries(COLUMN_NOTES)) {
      const layout = tables.get(table);
      expect(layout, table).toBeDefined();
      const held = new Set(variantsOf(layout!).flatMap(variant => variant.columns.map(label)));
      const noted = Object.keys(notes).flatMap(key => columnsOfKey(key).map(label));
      expect(
        noted.filter(id => !held.has(id)),
        table,
      ).toEqual([]);
      expect(new Set(noted).size, table).toBe(noted.length);
    }
  });

  it('is what the layouts and the notes render', () => {
    const rendered = renderTableColumns();
    if (process.env.UPDATE_DOCS) writeFileSync(PAGE, rendered);
    expect(readFileSync(PAGE, 'utf8')).toBe(rendered);
  });
});
