/**
 * The vendor's window, with a game behind it.
 *
 * The build keeps two pages: what the vendor has for sale, and what you
 * are carrying. The tabs across the top swap between them.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { ArtSellWindow, SELL_SCREEN } from './components/ArtSellWindow';
import { ArtShopWindow, SHOP_SCREEN } from './components/ArtShopWindow';
import { useWornScreen } from './art/useWorn';
import { WornStage } from './art/WornStage';
import { closeShop, shopInteraction } from './hudStore';

export function ShopWindowContainer(): JSX.Element | null {
  const worn = useWornScreen(SHOP_SCREEN);
  const selling = useWornScreen(SELL_SCREEN);
  const [page, setPage] = useState<'buy' | 'sell'>(
    // The bench opens whichever page it was asked for; during play the
    // vendor always opens on what it has for sale.
    globalThis.location?.search.includes('showing=sell') ? 'sell' : 'buy',
  );
  const shop = shopInteraction.value;
  // This window outlives each vendor, so the page is put back to Buy
  // whenever a vendor's shop shuts or another vendor's opens.
  const vendor = shop?.vendorName ?? null;
  useEffect(() => {
    if (!globalThis.location?.search.includes('showing=sell')) setPage('buy');
  }, [vendor]);
  if (!shop) return null;

  if (worn) {
    return (
      <WornStage>
        {page === 'sell' && selling ? (
          <ArtSellWindow
            vendorName={shop.vendorName}
            balance={shop.balance ?? 0}
            onSell={item => shop.onSellItem?.(item)}
            onBuy={() => setPage('buy')}
            onClose={closeShop}
          />
        ) : (
          <ArtShopWindow
            vendorName={shop.vendorName}
            balance={shop.balance ?? 0}
            items={shop.items}
            onBuy={shop.onBuy}
            onSell={() => (selling ? setPage('sell') : shop.onSell())}
            onClose={closeShop}
          />
        )}
      </WornStage>
    );
  }

  return null;
}
