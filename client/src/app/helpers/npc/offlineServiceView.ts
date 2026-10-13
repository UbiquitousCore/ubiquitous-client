import type { Service } from '../../../gameplay/npcInteraction';
import type { DebugInteraction, ShopInteraction } from '../../../ui/hudStore';
import { offlineVendorShopInteraction } from '../../features/vendor/shopInteractions';

export type OfflineServiceView =
  | { kind: 'warn'; message: string }
  | { kind: 'shop'; interaction: ShopInteraction }
  | { kind: 'debug'; interaction: DebugInteraction }
  | null;

/** What UI to show when a service body has no network id yet. */
export function offlineServiceView(args: {
  service: Service;
  entityId: number;
  vendorName: string;
  balance: number;
}): OfflineServiceView {
  const { service, entityId, vendorName, balance } = args;
  if (service === 'storage' || service === 'mail') {
    return {
      kind: 'warn',
      message:
        `${service === 'storage' ? 'storage' : 'mail'}: entity ${entityId} has no networked twin, ` +
        'so there is nothing to ask the server about',
    };
  }
  if (service === 'shop') {
    return { kind: 'shop', interaction: offlineVendorShopInteraction(vendorName, balance) };
  }
  if (service === 'auction') {
    return {
      kind: 'debug',
      interaction: {
        title: 'Auction House (offline)',
        lines: [
          `Local entity: ${entityId}`,
          'This auctioneer is not connected to a server.',
          'The auction house requires a network session.',
        ],
        actions: [],
      },
    };
  }
  if (service === 'talk') {
    return {
      kind: 'debug',
      interaction: {
        title: 'NPC Gossip (offline)',
        lines: [
          `Local entity: ${entityId}`,
          'This NPC is not connected to a server.',
          'Gossip requires a network session.',
        ],
        actions: [],
      },
    };
  }
  return null;
}
