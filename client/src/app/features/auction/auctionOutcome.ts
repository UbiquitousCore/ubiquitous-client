import { formatMoney } from '../../../ui/money';

/** The server's answer to something the player asked of the auction house. */
export type AuctionAnswer =
  | { kind: 'listed' | 'cancelled'; ok: boolean; reason?: string | null }
  | { kind: 'bid'; ok: boolean; currentBid: number; reason?: string | null }
  | { kind: 'bought'; ok: boolean; price: number; reason?: string | null };

/**
 * The line the auction window shows for an answer, and whether the listings
 * are stale and should be browsed again. A refusal gives the server's own
 * reason when it sent one.
 */
export function auctionOutcome(answer: AuctionAnswer): { status: string; refresh: boolean } {
  if (!answer.ok) {
    const refused = { listed: 'Listing', cancelled: 'Cancel', bid: 'Bid', bought: 'Buyout' }[
      answer.kind
    ];
    return { status: answer.reason ?? `${refused} refused.`, refresh: false };
  }
  switch (answer.kind) {
    case 'listed':
      return { status: 'Listed — the item left your bag.', refresh: true };
    case 'cancelled':
      return { status: 'Cancelled — the item is back in your bag.', refresh: true };
    case 'bid':
      return {
        status: `Bid placed — current price ${formatMoney(answer.currentBid)}.`,
        refresh: true,
      };
    case 'bought':
      // The item travels by mail; say where the goods went rather than leave
      // the buyer staring at an unchanged bag.
      return {
        status: `Bought for ${formatMoney(answer.price)} — the item arrives by mail.`,
        refresh: true,
      };
  }
}
