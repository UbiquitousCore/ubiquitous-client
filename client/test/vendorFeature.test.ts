import { describe, expect, it, vi } from 'vitest';
import { vendorHandlers } from '../src/app/features/vendor/vendor';
import type { UiArt } from '../src/app/UiArt';
import type { ResourceSystem } from '../src/assets/ResourceSystem';
import { ITEM_OK } from '../src/net/itemErrors';
import type { GameConnection } from '../src/net/GameConnection';

function setup(vendorId: number | null) {
  const connection = { sendVendorOpen: vi.fn() };
  const audio = { play: vi.fn() };
  const handlers = vendorHandlers({
    connection: connection as unknown as GameConnection,
    art: {} as UiArt,
    resources: {} as ResourceSystem,
    audio,
    openVendorId: () => vendorId,
  });
  return { connection, audio, handlers };
}

describe('a shop’s answers', () => {
  it('re-opens the vendor after a purchase, so the stock is current', () => {
    const { connection, audio, handlers } = setup(42);
    handlers.onVendorBuyResult?.(ITEM_OK);
    expect(connection.sendVendorOpen).toHaveBeenCalledWith(42);
    expect(audio.play).toHaveBeenCalledWith('sfx_ui_pickup_money');
  });

  it('asks nobody when no shop is open', () => {
    const { connection, handlers } = setup(null);
    handlers.onVendorBuyResult?.(ITEM_OK);
    expect(connection.sendVendorOpen).not.toHaveBeenCalled();
  });
});
