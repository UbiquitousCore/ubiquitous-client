interface GatewayLink {
  topZoneId: number;
  zoneId: number;
}

/** Gateway region per sub-area zone id, for one top region's links. */
export function gatewayRegionsForTop<T>(
  links: readonly GatewayLink[],
  zoneById: (id: number) => T | null,
): Map<number, T> {
  const gateways = new Map<number, T>();
  for (const link of links) {
    const region = zoneById(link.topZoneId);
    if (region) gateways.set(link.zoneId, region);
  }
  return gateways;
}
