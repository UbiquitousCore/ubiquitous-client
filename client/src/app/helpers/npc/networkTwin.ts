interface TwinEntity {
  id: number;
  kind: string;
  entry: number;
  position: [number, number, number];
}

/** Server network id of the matching replicated twin for a local static body. */
export function networkTwinNetworkIdFor(
  entity: TwinEntity,
  others: Iterable<TwinEntity>,
  networkIdOf: (id: number) => number | undefined,
): number | undefined {
  const TWIN_RADIUS_SQ = 4 * 4;
  for (const other of others) {
    if (other === entity || other.kind !== entity.kind || other.entry !== entity.entry) continue;
    const dx = other.position[0] - entity.position[0];
    const dy = other.position[1] - entity.position[1];
    const dz = other.position[2] - entity.position[2];
    if (dx * dx + dy * dy + dz * dz > TWIN_RADIUS_SQ) continue;
    const id = networkIdOf(other.id);
    if (id !== undefined) return id;
  }
  return undefined;
}
