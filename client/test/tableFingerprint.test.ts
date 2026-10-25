/**
 * The build fingerprint: every loaded table's shape, for the boot log and
 * for comparing against the server's golden fingerprints. A new build shows
 * up here first, as shape drift rather than a bare column error.
 */

import { describe, expect, it } from 'vitest';

import { WorldTables } from '../src/assets/formats/tables';
import { buildTableFiles } from './helpers/fixtures';

describe('table fingerprint', () => {
  it('lists every loaded table with its shape', async () => {
    const files = new Map(buildTableFiles().map(e => [e.name, e.data]));
    const tables = await WorldTables.load(async entry => files.get(entry) ?? null);
    const print = tables.fingerprint();
    expect(print.length).toBeGreaterThan(0);
    for (const line of print) {
      expect(line).toMatch(/^[^:]+: \d+ rows, \d+ cols, format ".+"$/);
    }
    // Every loaded table is listed, with the format it was read with.
    const byName = new Map(print.map(line => [line.slice(0, line.indexOf(':')), line]));
    for (const name of files.keys()) {
      const short = name.replace(/^tables\//, '').replace(/\.tbl$/, '');
      let listed: string | undefined;
      try {
        tables.table(short);
        listed = byName.get(short);
      } catch {
        continue; // a fixture file no consumer loads (string tables live elsewhere)
      }
      expect(listed, short).toBeDefined();
      expect(listed).toContain(`format "${tables.table(short).format}"`);
    }
  });
});
