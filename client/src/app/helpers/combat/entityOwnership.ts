interface IsOwnBodyArgs {
  id: number;
  playerId: number | undefined;
  networkId: number | undefined;
  isSelfNetworkId: (networkId: number) => boolean;
}

/** Whether this local entity is the hero's own body. */
export function isOwnBodyId(args: IsOwnBodyArgs): boolean {
  const { id, playerId, networkId, isSelfNetworkId } = args;
  if (playerId === id) return true;
  return networkId !== undefined && isSelfNetworkId(networkId);
}

interface OnOwnSideArgs {
  id: number;
  isOwnBody: boolean;
  networkId: number | undefined;
  partyNetworkIds: readonly number[];
}

/** Whether a body is the hero's own or a teammate's. */
export function onOwnSideId(args: OnOwnSideArgs): boolean {
  const { isOwnBody, networkId, partyNetworkIds } = args;
  if (isOwnBody) return true;
  return networkId !== undefined && partyNetworkIds.includes(networkId);
}
