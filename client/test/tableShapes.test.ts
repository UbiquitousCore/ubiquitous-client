/** Every loaded table's shape, as it is sent to the server at sign-in. */

import { describe, expect, it } from 'vitest';

import { FTable } from '../src/assets/formats/ftable';
import { WorldTables } from '../src/assets/formats/tables';
import { buildTableFiles } from './helpers/fixtures';

describe('table shapes', () => {
  it('lists every loaded table with its own length and format', async () => {
    const files = new Map(buildTableFiles().map(e => [e.name, e.data]));
    const tables = await WorldTables.load(async entry => files.get(entry) ?? null);
    const shapes = tables.shapes();
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      const own = new FTable(files.get(`tables/${shape.name}.tbl`)!);
      expect(shape, shape.name).toEqual({ name: shape.name, rows: own.rows, format: own.format });
    }
    expect(shapes.map(shape => shape.name)).toContain('zones');
  });
});
