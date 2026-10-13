import { describe, expect, it } from 'vitest';

import { mapHudLoads } from '../src/app/helpers/map/mapHudLoads';

describe('mapHudLoads', () => {
  it('requests missing map assets when map is open', () => {
    const out = mapHudLoads({
      mapZone: { mapId: 9 },
      viewZone: { id: 12 },
      playerPosition: [1, 0, 2],
      hasAreaMapUrl: () => false,
      hasRouteMapUrl: () => false,
      mapOpen: true,
      teleporting: false,
      zonesWarmed: false,
      hasAreaLinks: false,
      hasWorldMap: false,
      hasPlayerBody: true,
    });

    expect(out.refreshMapZone).toBe(true);
    expect(out.loadAreaMapId).toBe(12);
    expect(out.loadRouteMapId).toBeNull();
    expect(out.warmZones).toBe(true);
    expect(out.loadAreaLinks).toBe(true);
    expect(out.loadWorldMap).toBe(true);
    expect(out.ensureMinimap).toEqual({ mapId: 9, x: 1, z: 2 });
  });

  it('skips optional loads when already satisfied', () => {
    const out = mapHudLoads({
      mapZone: null,
      viewZone: null,
      playerPosition: [1, 0, 2],
      hasAreaMapUrl: () => true,
      hasRouteMapUrl: () => true,
      mapOpen: false,
      teleporting: false,
      zonesWarmed: true,
      hasAreaLinks: true,
      hasWorldMap: true,
      hasPlayerBody: false,
    });

    expect(out).toEqual({
      refreshMapZone: false,
      loadAreaMapId: null,
      loadRouteMapId: null,
      warmZones: false,
      loadAreaLinks: false,
      loadWorldMap: false,
      ensureMinimap: null,
    });
  });

  it('asks for the picture with the network drawn in only while travelling, and only once', () => {
    const base = {
      mapZone: { mapId: 9 },
      viewZone: { id: 12 },
      playerPosition: [1, 0, 2] as [number, number, number],
      hasAreaMapUrl: () => true,
      hasRouteMapUrl: () => false,
      mapOpen: true,
      zonesWarmed: true,
      hasAreaLinks: true,
      hasWorldMap: true,
      hasPlayerBody: true,
    };
    expect(mapHudLoads({ ...base, teleporting: true }).loadRouteMapId).toBe(12);
    expect(mapHudLoads({ ...base, teleporting: false }).loadRouteMapId).toBeNull();
    expect(
      mapHudLoads({ ...base, teleporting: true, hasRouteMapUrl: () => true }).loadRouteMapId,
    ).toBeNull();
  });
});
