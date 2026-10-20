import type { UiArt } from '../../UiArt';
import { logger } from '../../../core/log';
import type { ResourceSystem } from '../../../assets/ResourceSystem';
import { shopItemsFromTabs } from './shopInteractions';
import type { AudioEngine } from '../../../audio/AudioEngine';
import type { ConnectionEvents, GameConnection } from '../../../net/GameConnection';
import { shopInteraction, updateShopItems } from '../../../ui/hudStore';
import { itemErrorMessage, itemResultOk } from '../../../net/itemErrors';
import { reportToPlayer } from '../../../gameplay/SpellBook';

const log = logger('vendor');

const DEAL_SOUND = 'sfx_ui_shop_deal';
const NO_DEAL_SOUND = 'sfx_ui_shop_nodeal';
/** Own choice: a purchase rings like coins picked up. */
const PURCHASE_SOUND = 'sfx_ui_pickup_money';

/** What a shop answers: its stock, and whether a purchase or sale went through. */
export function vendorHandlers(shop: {
  connection: GameConnection;
  art: UiArt;
  resources: ResourceSystem;
  audio: Pick<AudioEngine, 'play'>;
  /** The vendor whose window is open, or null. */
  openVendorId: () => number | null;
}): Partial<ConnectionEvents> {
  return {
    onVendorItems: tabs => {
      const items = shopItemsFromTabs(tabs);
      updateShopItems(items);
      for (const item of items) {
        // Without the picture every card is an empty plinth.
        shop.art.resolveLootArt(item.id);
        void shop.resources.itemName(item.id).then(name => {
          if (!name) return;
          const current = shopInteraction.value?.items ?? [];
          updateShopItems(
            current.map(existing => (existing.id === item.id ? { ...existing, name } : existing)),
          );
        });
      }
    },
    onVendorBuyResult: code => {
      shop.audio.play(itemResultOk(code) ? PURCHASE_SOUND : NO_DEAL_SOUND);
      if (itemResultOk(code)) {
        log.info('purchase complete');
        const vendorId = shop.openVendorId();
        if (vendorId !== null) shop.connection.sendVendorOpen(vendorId);
        return;
      }
      reportToPlayer(itemErrorMessage(code));
    },
    onVendorSellResult: code => {
      shop.audio.play(itemResultOk(code) ? DEAL_SOUND : NO_DEAL_SOUND);
      if (itemResultOk(code)) return;
      // The sell page has already let go of the item; a silent refusal
      // would look like the sale vanished.
      log.warn(`sale refused ${code}: ${itemErrorMessage(code)}`);
      reportToPlayer(itemErrorMessage(code));
    },
  };
}

/** Item refusals and gains from any source. */
export function itemHandlers(): Partial<ConnectionEvents> {
  return {
    onItemError: code => {
      // Sent by storage, so it can arrive on top of another answer. A banner,
      // not a dialog: a modal would block retrying the loot.
      log.warn(`item error ${code}: ${itemErrorMessage(code)}`);
      reportToPlayer(itemErrorMessage(code));
    },
  };
}
