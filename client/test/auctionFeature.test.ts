import { describe, expect, it, vi } from 'vitest';
import { auctionHandlers } from '../src/app/features/auction/auction';
import type { ResourceSystem } from '../src/assets/ResourceSystem';
import type { GameConnection } from '../src/net/GameConnection';
import { auctionInteraction } from '../src/ui/auctionStore';

function setup() {
  const connection = { sendAuctionBrowse: vi.fn() };
  const resources = {
    itemName: vi.fn(async (entry: number) => `Name ${entry}`),
    itemIcon: vi.fn(async () => null),
    itemFacts: vi.fn(async () => null),
    itemText: vi.fn(async () => null),
  };
  const handlers = auctionHandlers(
    connection as unknown as GameConnection,
    resources as unknown as ResourceSystem,
  );
  return { connection, resources, handlers };
}

describe('the auction house', () => {
  it('browses again after a sale and not after a refusal', () => {
    const { connection, handlers } = setup();
    handlers.onAuctionBought?.(true, 'a', 900, null);
    expect(connection.sendAuctionBrowse).toHaveBeenCalledTimes(1);
    handlers.onAuctionBought?.(false, 'a', 900, 'nope');
    expect(connection.sendAuctionBrowse).toHaveBeenCalledTimes(1);
  });

  it('opens the window when the server says so', () => {
    const { handlers } = setup();
    handlers.onAuctionOpened?.();
    expect(auctionInteraction.value).not.toBeNull();
  });
});
