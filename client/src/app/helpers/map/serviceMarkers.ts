import type { MapMarker } from '../../../ui/mapModel';

interface MarkerEntity {
  id: number;
  networkName?: string;
  position: [number, number, number];
  interactionIcon?: string;
}

interface TeamBody {
  id: number;
  networkName?: string;
  position: [number, number, number];
}

/** How many team colours the movie draws a teammate in; more teammates reuse them in turn. */
export const TEAM_SLOTS = 3;

/** A marker for each online teammate whose body is in the world, except the player's own. */
export function teamMarkersForMap(
  bodies: readonly TeamBody[],
  player: TeamBody | null,
  members: readonly { networkId: number; name: string; online: boolean }[],
  networkIdOf: (id: number) => number | undefined,
): MapMarker[] {
  const self = player ? networkIdOf(player.id) : undefined;
  const others = members.filter(member => member.online && member.networkId !== self);
  const onTeam = new Map(others.map((member, at) => [member.networkId, { member, at }]));
  return bodies.flatMap(body => {
    if (body === player) return [];
    const found = onTeam.get(networkIdOf(body.id) ?? -1);
    return found
      ? [
          {
            id: `member:${found.member.networkId}`,
            label: found.member.name,
            position: body.position,
            kind: 'member' as const,
            slot: (found.at % TEAM_SLOTS) + 1,
          },
        ]
      : [];
  });
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
