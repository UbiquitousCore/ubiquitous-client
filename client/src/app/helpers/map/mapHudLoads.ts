export interface MapHudLoads {
  refreshMapZone: boolean;
  loadAreaMapId: number | null;
  /** The region to fetch the picture with its bus network drawn in for. */
  loadRouteMapId: number | null;
  warmZones: boolean;
  loadAreaLinks: boolean;
  loadWorldMap: boolean;
  ensureMinimap: { mapId: number; x: number; z: number } | null;
}

/** What map-related async loads this HUD frame should trigger. */
export function mapHudLoads(args: {
  mapZone: { mapId: number } | null;
  viewZone: { id: number } | null;
  playerPosition: [number, number, number];
  hasAreaMapUrl: (id: number) => boolean;
  hasRouteMapUrl: (id: number) => boolean;
  mapOpen: boolean;
  teleporting: boolean;
  zonesWarmed: boolean;
  hasAreaLinks: boolean;
  hasWorldMap: boolean;
  hasPlayerBody: boolean;
}): MapHudLoads {
  const {
    mapZone,
    viewZone,
    playerPosition,
    hasAreaMapUrl,
    hasRouteMapUrl,
    mapOpen,
    teleporting,
    zonesWarmed,
    hasAreaLinks,
    hasWorldMap,
    hasPlayerBody,
  } = args;
  return {
    refreshMapZone: mapZone !== null,
    loadAreaMapId: viewZone && !hasAreaMapUrl(viewZone.id) ? viewZone.id : null,
    loadRouteMapId:
      mapOpen && teleporting && viewZone && !hasRouteMapUrl(viewZone.id) ? viewZone.id : null,
    warmZones: mapOpen && !zonesWarmed,
    loadAreaLinks: mapOpen && !hasAreaLinks,
    loadWorldMap: mapOpen && !hasWorldMap,
    ensureMinimap:
      mapZone && hasPlayerBody
        ? { mapId: mapZone.mapId, x: playerPosition[0], z: playerPosition[2] }
        : null,
  };
}
