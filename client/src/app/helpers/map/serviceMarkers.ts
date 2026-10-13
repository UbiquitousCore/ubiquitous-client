import type { MapMarker } from '../../../ui/mapModel';

interface MarkerEntity {
  id: number;
  networkName?: string;
  position: [number, number, number];
  interactionIcon?: string;
}

/** Service markers drawn on the map for nearby interactable entities. */
export function serviceMarkersForMap<T extends MarkerEntity>(
  entities: readonly T[],
  player: T | null,
  iconUrls: ReadonlyMap<string, string>,
  markerKind: (entity: T) => string | null,
): MapMarker[] {
  return entities
    .filter(entity => entity !== player && markerKind(entity) !== null)
    .map(entity => ({
      id: String(entity.id),
      label: entity.networkName ?? 'Entity',
      position: entity.position,
      kind: 'service' as const,
      iconUrl: entity.interactionIcon ? (iconUrls.get(entity.interactionIcon) ?? null) : null,
    }));
}
