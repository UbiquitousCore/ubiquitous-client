import { logger } from '../../../core/log';
import type { ConnectionEvents, GameConnection } from '../../../net/GameConnection';
import {
  applyTradeCancelled,
  applyTradeCompleted,
  applyTradeDeclined,
  applyTradeRequested,
  applyTradeStarted,
  applyTradeUpdated,
  noteTradeAsked,
  setTradeActions,
  tradeNotice,
} from '../../../ui/tradeStore';
import type { UiArt } from '../../UiArt';

const log = logger('trade');

/** What the trade's handlers need from the game around them. */
export interface TradeDeps {
  /** The notice line in chat. */
  say: (text: string | null) => void;
  networkName: (networkId: number) => string | null;
  art: Pick<UiArt, 'resolveLootArt'>;
}

/**
 * Player trade. Items and gold move as ordinary inventory deltas before
 * `trade.completed`; how a trade ended is said in chat, because the table has
 * gone.
 */
export function tradeHandlers(deps: TradeDeps): Partial<ConnectionEvents> {
  const { say, networkName, art } = deps;
  return {
    onTradeRequested: fromId => applyTradeRequested(fromId, networkName(fromId)),
    onTradeDeclined: () => {
      applyTradeDeclined();
      say(tradeNotice.peek());
    },
    onTradeStarted: opponentId => applyTradeStarted(opponentId, networkName(opponentId)),
    onTradeUpdated: state => {
      applyTradeUpdated(state);
      for (const item of state.opponentItems) art.resolveLootArt(item.entry);
    },
    onTradeCancelled: (_opponentId, reason) => {
      applyTradeCancelled(reason);
      say(tradeNotice.peek());
      log.info(`trade: cancelled (${reason})`);
    },
    onTradeCompleted: () => {
      applyTradeCompleted();
      say(tradeNotice.peek());
    },
  };
}

/**
 * The window's buttons, each one a request to the server. `asked` stamps the
 * request, so a silent refusal can be matched to it.
 */
export function installTradeActions(
  connection: GameConnection,
  targetNetworkId: () => number | undefined,
  networkName: (networkId: number) => string | null,
  asked: () => void,
): void {
  setTradeActions({
    requestTarget: () => {
      const networkId = targetNetworkId();
      if (networkId === undefined) return;
      // Success is silent, so the window records that it asked.
      noteTradeAsked(networkId, networkName(networkId));
      asked();
      connection.sendTradeRequest(networkId);
    },
    accept: () => connection.sendTradeAccept(),
    decline: () => connection.sendTradeDecline(),
    offer: (itemIds, gold) => connection.sendTradeOffer(itemIds, gold),
    confirm: confirmed => connection.sendTradeConfirm(confirmed),
    cancel: () => connection.sendTradeCancel(),
  });
}
