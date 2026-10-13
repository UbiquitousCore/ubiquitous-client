interface ServiceMarkerEntity {
  kind: string;
  npcFlags?: number;
}

/**
 * Whether an entity earns a service marker on the map: a creature whose NPC
 * flags say it is a shop or a teleporter. A static object — a mailbox, a
 * chest — never does, and neither does a creature with no flags to read.
 */
export function serviceMarkerKind(
  entity: ServiceMarkerEntity,
  showsOnMap: (flags: number) => boolean,
): 'service' | null {
  if (entity.kind !== 'creature' || entity.npcFlags === undefined) return null;
  return showsOnMap(entity.npcFlags) ? 'service' : null;
}
