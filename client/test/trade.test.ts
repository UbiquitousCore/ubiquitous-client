import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installTradeActions, tradeHandlers } from '../src/app/features/social/trade';
import type { GameConnection } from '../src/net/GameConnection';
import {
  opponentOffer,
  resetTrade,
  setTradeActions,
  tradeActions,
  tradeNotice,
  tradeOpponent,
  tradeOpponentName,
  tradePhase,
} from '../src/ui/tradeStore';

const INERT = tradeActions();

function handlers() {
  const said: Array<string | null> = [];
  const art = { resolveLootArt: vi.fn() };
  const h = tradeHandlers({
    say: text => said.push(text),
    networkName: id => (id === 2 ? 'Bran' : null),
    art,
  });
  return { h, said, art };
}

beforeEach(() => {
  resetTrade();
  setTradeActions(INERT);
});

describe('tradeHandlers', () => {
  it('names the one who proposes, or leaves the name empty when they are not in the world', () => {
    const { h } = handlers();
    h.onTradeRequested!(2);
    expect(tradePhase.value).toBe('invited');
    expect(tradeOpponentName.value).toBe('Bran');
    h.onTradeRequested!(9);
    expect(tradeOpponentName.value).toBeNull();
  });

  it('opens the table with the opponent’s name', () => {
    const { h } = handlers();
    h.onTradeStarted!(2);
    expect(tradePhase.value).toBe('open');
    expect(tradeOpponent.value).toBe(2);
    expect(tradeOpponentName.value).toBe('Bran');
  });

  it('draws the art for every item offered, and shows the offer', () => {
    const { h, art } = handlers();
    h.onTradeUpdated!({
      opponentId: 2,
      opponentGold: 50,
      opponentItems: [
        { id: 'a', entry: 11, count: 1 },
        { id: 'b', entry: 12, count: 3 },
      ],
      opponentConfirmed: false,
      yourConfirmed: false,
    });
    expect(art.resolveLootArt.mock.calls).toEqual([[11], [12]]);
    expect(opponentOffer.value.gold).toBe(50);
  });

  it('says in chat how a trade ended, as the store worded it', () => {
    const { h, said } = handlers();
    h.onTradeDeclined!(2);
    h.onTradeCancelled!(2, 'out_of_range');
    h.onTradeCompleted!(2);
    expect(said).toEqual([
      'They declined.',
      'Trade cancelled — you moved too far apart.',
      'Trade completed.',
    ]);
    expect(tradePhase.value).toBe('idle');
  });

  it('keeps the wire reason when it is one it has no sentence for', () => {
    const { h, said } = handlers();
    h.onTradeCancelled!(2, 'weather' as never);
    expect(said).toEqual(['Trade cancelled — weather.']);
  });
});

describe('installTradeActions', () => {
  function actions(target: number | null = 2) {
    const connection = {
      sendTradeRequest: vi.fn(),
      sendTradeAccept: vi.fn(),
      sendTradeDecline: vi.fn(),
      sendTradeOffer: vi.fn(),
      sendTradeConfirm: vi.fn(),
      sendTradeCancel: vi.fn(),
    };
    const asked = vi.fn();
    installTradeActions(
      connection as unknown as GameConnection,
      () => target ?? undefined,
      id => (id === 2 ? 'Bran' : null),
      asked,
    );
    return { connection, asked, run: tradeActions() };
  }

  it('proposes to the HUD’s target, recording that it asked', () => {
    const { connection, asked, run } = actions();
    run.requestTarget();
    expect(connection.sendTradeRequest).toHaveBeenCalledWith(2);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(tradePhase.value).toBe('asked');
    expect(tradeOpponentName.value).toBe('Bran');
    expect(tradeNotice.value).toContain('waiting');
  });

  it('proposes to nobody when nothing is targeted', () => {
    const { connection, asked, run } = actions(null);
    run.requestTarget();
    expect(connection.sendTradeRequest).not.toHaveBeenCalled();
    expect(asked).not.toHaveBeenCalled();
    expect(tradePhase.value).toBe('idle');
  });

  it('passes the rest straight through', () => {
    const { connection, run } = actions();
    run.accept();
    run.decline();
    run.offer(['i1'], 5);
    run.confirm(true);
    run.cancel();
    expect(connection.sendTradeAccept).toHaveBeenCalled();
    expect(connection.sendTradeDecline).toHaveBeenCalled();
    expect(connection.sendTradeOffer).toHaveBeenCalledWith(['i1'], 5);
    expect(connection.sendTradeConfirm).toHaveBeenCalledWith(true);
    expect(connection.sendTradeCancel).toHaveBeenCalled();
  });
});
