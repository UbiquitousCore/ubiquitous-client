import type { ZoneInfo } from '../../../assets/types';
import type { TeleportStop } from '../../../gameplay/TravelNetwork';
import type { MapPlace } from '../../../ui/mapModel';
import { reachableStopForPlace } from './placeTeleport';

export function mapPlaceForZone(args: {
  zone: ZoneInfo;
  topMapId: number;
  gatewayRegion: ZoneInfo | null;
  fares: ReadonlyMap<number, number>;
  stops: readonly TeleportStop[];
}): MapPlace {
  const { zone, topMapId, gatewayRegion, fares, stops } = args;
  const stop = reachableStopForPlace(zone, gatewayRegion, topMapId, fares, stops);
  const centre: [number, number, number] = [zone.centre[0], 0, zone.centre[1]];
  return {
    id: zone.id,
    name: zone.name,
    position: centre,
    friendly: zone.friendly,
    teleport: stop
      ? {
          id: `teleport-${stop.id}`,
          label: zone.name,
          position: centre,
          kind: 'teleport',
        }
      : null,
  };
}
