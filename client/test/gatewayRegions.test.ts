import { describe, expect, it } from 'vitest';

import { gatewayRegionsForTop } from '../src/app/helpers/map/gatewayRegions';

describe('gatewayRegionsForTop', () => {
  it('maps each sub-area zone id to its destination top region when known', () => {
    const byId = new Map([
      [20, { id: 20, mapId: 2 }],
      [30, { id: 30, mapId: 3 }],
    ]);
    const out = gatewayRegionsForTop(
      [
        { topZoneId: 20, zoneId: 100 },
        { topZoneId: 30, zoneId: 200 },
      ],
      id => byId.get(id) ?? null,
    );
    expect(out.get(100)).toEqual({ id: 20, mapId: 2 });
    expect(out.get(200)).toEqual({ id: 30, mapId: 3 });
  });

  it('skips links whose destination region cannot be resolved', () => {
    const out = gatewayRegionsForTop([{ topZoneId: 99, zoneId: 100 }], () => null);
    expect(out.size).toBe(0);
  });

  it('lets later links for the same sub-area zone overwrite earlier ones', () => {
    const byId = new Map([
      [20, { id: 20 }],
      [30, { id: 30 }],
    ]);
    const out = gatewayRegionsForTop(
      [
        { topZoneId: 20, zoneId: 100 },
        { topZoneId: 30, zoneId: 100 },
      ],
      id => byId.get(id) ?? null,
    );
    expect(out.get(100)).toEqual({ id: 30 });
  });
});
