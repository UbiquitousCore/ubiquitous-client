import type { Service } from '../../../gameplay/npcInteraction';

interface OnlineServiceHandlers {
  storage(networkId: number): void;
  mail(networkId: number): void;
  summon(networkId: number): void;
  quests(networkId: number): void;
  shop(networkId: number): void;
  auction(networkId: number): void;
  talk(networkId: number): void;
  use(networkId: number): void;
}

/** Dispatch one resolved online service interaction. */
export function dispatchOnlineService(
  service: Service,
  networkId: number,
  handlers: OnlineServiceHandlers,
): void {
  switch (service) {
    case 'storage':
      handlers.storage(networkId);
      return;
    case 'mail':
      handlers.mail(networkId);
      return;
    case 'summon':
      handlers.summon(networkId);
      return;
    case 'quests':
      handlers.quests(networkId);
      return;
    case 'shop':
      handlers.shop(networkId);
      return;
    case 'auction':
      handlers.auction(networkId);
      return;
    case 'talk':
      handlers.talk(networkId);
      return;
    case 'use':
      handlers.use(networkId);
      return;
    case 'travel':
      return;
  }
}
