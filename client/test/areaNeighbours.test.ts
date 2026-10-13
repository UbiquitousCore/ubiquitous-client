import { describe, expect, it } from 'vitest';

import { neighbourRegions } from '../src/app/helpers/map/areaNeighbours';

describe('neighbourRegions', () => {
  it('maps neighbour slots to directions in up/down/left/right order', () => {
    const byId = new Map([
      [10, { id: 10, name: 'North' }],
      [20, { id: 20, name: 'South' }],
      [30, { id: 30, name: 'West' }],
      [40, { id: 40, name: 'East' }],
    ]);
    const out = neighbourRegions([10, 20, 30, 40], byId);
    expect(out).toEqual([
      { direction: 'up', region: { id: 10, name: 'North' } },
      { direction: 'down', region: { id: 20, name: 'South' } },
      { direction: 'left', region: { id: 30, name: 'West' } },
      { direction: 'right', region: { id: 40, name: 'East' } },
    ]);
  });

  it('drops zero, missing and unknown neighbours', () => {
    const byId = new Map([[20, { id: 20, name: 'South' }]]);
    const out = neighbourRegions([0, 20, 999], byId);
    expect(out).toEqual([{ direction: 'down', region: { id: 20, name: 'South' } }]);
  });

  it('returns no neighbours when the row is missing', () => {
    expect(neighbourRegions(undefined, new Map())).toEqual([]);
  });
});
