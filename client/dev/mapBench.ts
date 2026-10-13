/**
 * The map's state, seeded from the player's own build.
 *
 * `worn.html?screen=hud&map=area` opens the region map over the HUD with the
 * places, neighbours and world pictures the game would give it for one
 * region; `map=world` opens the world map and `map=travel` the region map as
 * a teleport master opens it, standing at the region's first bus stop.
 * `?region=<top zone id>` picks the region.
 *
 * Dev only. It builds the same records `Game` does, out of the same helpers.
 */

import type { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import {
  areaLinksId,
  areaMapId,
  busRoutesId,
  teleportStopsId,
  textureId,
  zoneIndexId,
} from '../src/assets/ids';
import type { TextureData, ZoneInfo } from '../src/assets/types';
import { neighbourRegions } from '../src/app/helpers/map/areaNeighbours';
import { detailZonesInTop } from '../src/app/helpers/map/detailZones';
import { placeNameAt } from '../src/app/helpers/map/placeName';
import { mapPlaceForZone } from '../src/app/helpers/map/mapPlace';
import { routeLegsForTopMap } from '../src/app/helpers/map/routeLegs';
import { listedWorldRegions } from '../src/app/helpers/map/worldRegions';
import { BUS_STOP_TYPE, TravelNetwork } from '../src/gameplay/TravelNetwork';
import type { TeleportStop } from '../src/gameplay/TravelNetwork';
import type { BusLeg } from '../src/gameplay/busRoutes';
import { drawnRect } from '../src/world/mapArt';
import {
  closeMap,
  mapOpen,
  mapTeleporting,
  openMap,
  openTeleportMap,
  setMapRegionHandler,
  setMapState,
  setMapTeleportHandler,
} from '../src/ui/hudStore';
import type { MapPlace } from '../src/ui/mapModel';
import { askTravel, fareWords } from '../src/ui/travelStore';

/** The priority the zone table gives a named place inside a region. */
const DETAIL_PRIORITY = 13;

/** A picture with the blank margin its texture is padded with cut off. */
async function cropped(
  image: ImageBitmap,
): Promise<{ url: string; width: number; height: number } | null> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  const { left, top, width, height } = drawnRect(image.width, image.height, (x, y) => {
    const at = (y * image.width + x) * 4;
    return { r: data[at]!, g: data[at + 1]!, b: data[at + 2]!, a: data[at + 3]! };
  });
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  out.getContext('2d')?.drawImage(image, left, top, width, height, 0, 0, width, height);
  const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
  return blob ? { url: URL.createObjectURL(blob), width, height } : null;
}

export async function seedMapBench(
  provider: PackAssetProvider,
  params: URLSearchParams,
): Promise<void> {
  const showing = params.get('map') ?? 'area';
  const zones: ZoneInfo[] = (await provider.load(zoneIndexId())).zones;
  const links = await provider.load(areaLinksId());
  const stops: readonly TeleportStop[] = await provider.load(teleportStopsId());
  const legs: readonly BusLeg[] = await provider.load(busRoutesId());
  const travel = new TravelNetwork(8);
  travel.load(stops, legs);

  const world = await provider
    .load(textureId('2d_texture/maps/world.tga'))
    .then((texture: TextureData) => cropped(texture.image))
    .catch(() => null);

  const regionOf = (id: number): ZoneInfo | undefined => zones.find(zone => zone.id === id);
  const regions = listedWorldRegions(links.regions, new Set(links.mapped), id => {
    const zone = regionOf(id);
    return zone ? { id, name: zone.name, button: links.buttons[id] } : null;
  });

  const show = async (regionId: number): Promise<void> => {
    const top = regionOf(regionId);
    if (!top) return;
    const inside = (stop: TeleportStop): boolean =>
      stop.position[0] >= top.bounds[0] &&
      stop.position[0] <= top.bounds[2] &&
      stop.position[2] >= top.bounds[1] &&
      stop.position[2] <= top.bounds[3];
    const bus = stops.filter(stop => stop.type === BUS_STOP_TYPE && stop.mapId === top.mapId);
    const departure = bus.find(inside) ?? bus[0];
    const fares = travel.faresFrom(departure?.id ?? null);
    const picture = await provider
      .load(areaMapId(regionId))
      .then((texture: TextureData) => cropped(texture.image))
      .catch(() => null);
    const withRoutes =
      showing === 'travel' && !params.has('noart')
        ? await provider
            .load(areaMapId(regionId, true))
            .then((texture: TextureData) => cropped(texture.image))
            .catch(() => null)
        : null;
    const details = detailZonesInTop(zones, regionId, DETAIL_PRIORITY);
    const places: MapPlace[] = details.map(zone =>
      mapPlaceForZone({
        zone,
        topMapId: top.mapId,
        gatewayRegion: null,
        fares,
        stops,
      }),
    );
    const here = departure?.position ?? [top.centre[0], 0, top.centre[1]];
    const byId = new Map(zones.map(zone => [zone.id, { id: zone.id, name: zone.name }]));
    setMapState({
      zoneName: top.name,
      placeName: placeNameAt(details, top.mapId, [here[0], 0, here[2]]),
      bounds: top.bounds,
      playerPosition: [here[0], 0, here[2]],
      playerYaw: 0.6,
      markers: [],
      imageUrl: picture?.url ?? null,
      routeImageUrl: showing === 'travel' ? (withRoutes?.url ?? null) : undefined,
      places,
      regions,
      neighbours: neighbourRegions(links.neighbours[regionId], byId),
      routes: showing === 'travel' ? routeLegsForTopMap(top.mapId, details, stops, legs) : [],
      worldMapUrl: world?.url ?? null,
      worldMapSize: world ? { width: world.width, height: world.height } : null,
    });
  };

  const region = Number(params.get('region') ?? 71);
  setMapRegionHandler(id => void show(id));
  setMapTeleportHandler(marker => {
    document.body.setAttribute('data-teleport', marker.label);
    askTravel({ place: marker.label, fare: fareWords(620), accept: () => {}, decline: () => {} });
  });
  await show(region);
  if (showing === 'travel') openTeleportMap();
  else if (showing === 'area' || showing === 'world') openMap();
  else closeMap();
  document.body.setAttribute('data-map', `${showing}:${mapOpen.value}:${mapTeleporting.value}`);
}
