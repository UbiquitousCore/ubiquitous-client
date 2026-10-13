/** Trade window container: store in, requests out. Offers go through `sendOffer`, which holds what was asked for until an update promotes it. */

import type { JSX } from 'preact';

import { ArtBagWindow } from './components/ArtBagWindow';
import { ArtTradeWindow, TRADE_SCREEN } from './components/ArtTradeWindow';
import { useWornScreen } from './art/useWorn';
import { target } from './hudStore';
import {
  closeTradeWindow,
  myOffer,
  opponentOffer,
  sendOffer,
  tradeActions,
  tradeNotice,
  tradeOpen,
  tradeOpponentName,
  tradePhase,
} from './tradeStore';

export function TradeWindowContainer(): JSX.Element | null {
  // Asked before anything else this draws, so the same number of hooks
  // runs whether the table is open or shut.
  const worn = useWornScreen(TRADE_SCREEN);
  // There is only the table: a proposal is asked in the message box, and
  // once the table is gone there is nothing left to show.
  if (!worn || !tradeOpen.value || tradePhase.value !== 'open') return null;
  const actions = tradeActions();
  const theirs = opponentOffer.value;
  return (
    <ArtTradeWindow
      mine={myOffer.value}
      theirs={{ items: theirs.items, gold: theirs.gold }}
      peerName={tradeOpponentName.value ?? target.value?.name ?? null}
      iConfirmed={theirs.yourConfirmed}
      theyConfirmed={theirs.opponentConfirmed}
      notice={tradeNotice.value}
      onOffer={(itemIds, gold) => sendOffer(itemIds, gold)}
      onConfirm={confirmed => actions.confirm(confirmed)}
      onClose={() => {
        actions.cancel();
        closeTradeWindow();
      }}
      // The bag, against the table's right edge for as long as the
      // trade lasts: a press on a
      // thing puts it on the table, as does dragging it across.
      beside={
        <ArtBagWindow
          onClose={() => {}}
          trading={{
            offered: myOffer.value.itemIds,
            offer: item => sendOffer([...myOffer.value.itemIds, item.id], myOffer.value.gold),
          }}
        />
      }
    />
  );
}
