import { describe, expect, it } from 'vitest';
import { auctionOutcome } from '../src/app/features/auction/auctionOutcome';
import { formatMoney } from '../src/ui/money';

describe('auctionOutcome', () => {
  it('says what happened and asks for fresh listings on every success', () => {
    expect(auctionOutcome({ kind: 'listed', ok: true })).toEqual({
      status: 'Listed — the item left your bag.',
      refresh: true,
    });
    expect(auctionOutcome({ kind: 'cancelled', ok: true }).status).toBe(
      'Cancelled — the item is back in your bag.',
    );
    expect(auctionOutcome({ kind: 'bid', ok: true, currentBid: 250 })).toEqual({
      status: `Bid placed — current price ${formatMoney(250)}.`,
      refresh: true,
    });
    expect(auctionOutcome({ kind: 'bought', ok: true, price: 900 }).status).toBe(
      `Bought for ${formatMoney(900)} — the item arrives by mail.`,
    );
  });

  it('shows the server reason on a refusal and leaves the listings alone', () => {
    expect(auctionOutcome({ kind: 'bid', ok: false, currentBid: 0, reason: 'Too low.' })).toEqual({
      status: 'Too low.',
      refresh: false,
    });
  });

  it('falls back to a plain refusal per kind when no reason came', () => {
    expect(auctionOutcome({ kind: 'listed', ok: false }).status).toBe('Listing refused.');
    expect(auctionOutcome({ kind: 'cancelled', ok: false }).status).toBe('Cancel refused.');
    expect(auctionOutcome({ kind: 'bid', ok: false, currentBid: 0 }).status).toBe('Bid refused.');
    expect(auctionOutcome({ kind: 'bought', ok: false, price: 0 }).status).toBe('Buyout refused.');
  });
});
