import { describe, expect, it } from 'vitest';

import { listedWorldRegions } from '../src/app/helpers/map/worldRegions';

describe('listedWorldRegions', () => {
  it('keeps area.cnfg order and drops zero, duplicate and unmapped ids', () => {
    const mapped = new Set([10, 20]);
    const out = listedWorldRegions([0, 10, 20, 10, 30], mapped, id =>
      id === 10 ? { id, name: 'Ten' } : id === 20 ? { id, name: 'Twenty' } : null,
    );
    expect(out).toEqual([
      { id: 10, name: 'Ten' },
      { id: 20, name: 'Twenty' },
    ]);
  });

  it('keeps placement data from resolver rows', () => {
    const out = listedWorldRegions([10], new Set([10]), id =>
      id === 10 ? { id, name: 'Ten', at: [0.1, 0.2, 0.3, 0.4] } : null,
    );
    expect(out).toEqual([{ id: 10, name: 'Ten', at: [0.1, 0.2, 0.3, 0.4] }]);
  });

  it('drops ids that map says are present but cache cannot resolve', () => {
    const out = listedWorldRegions([10], new Set([10]), () => null);
    expect(out).toEqual([]);
  });
});
