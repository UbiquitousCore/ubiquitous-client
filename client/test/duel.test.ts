// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { duelHandlers, installDuelActions } from '../src/app/features/social/duel';
import type { GameConnection } from '../src/net/GameConnection';
import {
  duelOpponent,
  duelOpponentName,
  duelPhase,
  pvpActions,
  pvpNotice,
  resetPvp,
  setPvpActions,
} from '../src/ui/pvpStore';

const INERT = pvpActions();

function handlers() {
  const said: Array<string | null> = [];
  const music: boolean[] = [];
  const forgotten: number[] = [];
  const h = duelHandlers({
    say: text => said.push(text),
    networkName: id => (id === 2 ? 'Bran' : null),
    forgetFightingMe: id => forgotten.push(id),
    setBattleMusic: on => music.push(on),
  });
  return { h, said, music, forgotten };
}

beforeEach(() => {
  resetPvp();
  setPvpActions(INERT);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('duelHandlers', () => {
  it('names the challenger when they are in the world', () => {
    const { h } = handlers();
    h.onDuelRequested!(2);
    expect(duelPhase.value).toBe('invited');
    expect(duelOpponentName.value).toBe('Bran');
    h.onDuelRequested!(9);
    expect(duelOpponentName.value).toBeNull();
  });

  it('says a declined or expired challenge in chat', () => {
    const { h, said } = handlers();
    h.onDuelRequested!(2);
    h.onDuelDeclined!(2);
    expect(said).toEqual(['The challenge was declined or expired.']);
    expect(duelPhase.value).toBe('idle');
  });

  it('tells the one who accepted so, counts down, then says start', () => {
    const { h, said, music } = handlers();
    h.onDuelRequested!(2);
    h.onDuelStarted!(2, 5);
    expect(duelPhase.value).toBe('duelling');
    expect(music).toEqual([true]);
    expect(said).toEqual(['Duel on. Get ready.']);
    vi.advanceTimersByTime(1999);
    expect(said).toEqual(['Duel on. Get ready.']);
    vi.advanceTimersByTime(1);
    expect(said.at(-1)).toBe('3');
    vi.advanceTimersByTime(3000);
    expect(said.slice(1)).toEqual(['3', '2', '1', 'Start!']);
  });

  it('tells the one who asked who took it up', () => {
    const { h, said } = handlers();
    duelPhase.value = 'challenged';
    h.onDuelStarted!(2, 0);
    expect(said[0]).toBe('Bran took up the duel. Get ready.');
    vi.advanceTimersByTime(0);
    expect(said.at(-1)).toBe('Start!');
  });

  it('ends the music, drops the grudge and says how it ended', () => {
    const { h, said, music, forgotten } = handlers();
    h.onDuelStarted!(2, 0);
    said.length = 0;
    h.onDuelEnded!(2, 'won', 40, 100);
    expect(music).toEqual([true, false]);
    expect(forgotten).toEqual([2]);
    expect(said).toEqual(['You won the duel.']);
    expect(duelOpponent.value).toBeNull();
    expect(pvpNotice.value).toBe('You won the duel.');
  });
});

describe('installDuelActions', () => {
  function actions(named = true) {
    const connection = {
      sendDuelRequest: vi.fn(),
      sendDuelAccept: vi.fn(),
      sendDuelDecline: vi.fn(),
      sendDuelForfeit: vi.fn(),
      sendPvpFlagSet: vi.fn(),
    };
    const said: Array<string | null> = [];
    const asked = vi.fn();
    installDuelActions(
      connection as unknown as GameConnection,
      {
        targetNetworkId: () => (named ? 2 : undefined),
        networkName: id => (named && id === 2 ? 'Bran' : null),
      },
      text => said.push(text),
      asked,
    );
    return { connection, said, asked, run: pvpActions() };
  }

  it('challenges the HUD’s target, saying so and recording that it asked', () => {
    const { connection, said, asked, run } = actions();
    run.challengeTarget();
    expect(connection.sendDuelRequest).toHaveBeenCalledWith(2);
    expect(said).toEqual(['Duel request sent to Bran.']);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(duelPhase.value).toBe('challenged');
  });

  it('challenges nobody when nothing is targeted', () => {
    const { connection, said, asked, run } = actions(false);
    run.challengeTarget();
    expect(connection.sendDuelRequest).not.toHaveBeenCalled();
    expect(said).toEqual([]);
    expect(asked).not.toHaveBeenCalled();
  });

  it('passes the rest straight through', () => {
    const { connection, run } = actions();
    run.accept();
    run.decline();
    run.forfeit();
    run.setFlagged(true);
    expect(connection.sendDuelAccept).toHaveBeenCalled();
    expect(connection.sendDuelDecline).toHaveBeenCalled();
    expect(connection.sendDuelForfeit).toHaveBeenCalled();
    expect(connection.sendPvpFlagSet).toHaveBeenCalledWith(true);
  });
});
