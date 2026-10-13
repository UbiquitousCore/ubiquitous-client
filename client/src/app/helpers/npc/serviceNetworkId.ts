import type { Service } from '../../../gameplay/npcInteraction';

/**
 * Which network id to act on for a service interaction.
 */
export function serviceNetworkIdForInteraction(args: {
  service: Service;
  entityKind: string;
  directNetworkId: number | undefined;
  twinNetworkId: number | undefined;
}): number | undefined {
  const { service, entityKind, directNetworkId, twinNetworkId } = args;
  if (service === 'storage' || service === 'mail' || entityKind === 'static') {
    return directNetworkId ?? twinNetworkId;
  }
  return directNetworkId;
}
