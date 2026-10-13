/**
 * Duels.
 *
 * A challenge is answered with silence on success, so `challenged` is this
 * client's own record that it asked. `duel.ended` carries this side's own
 * reason, which is said as sent.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyDuelDeclined,
  applyDuelEnded,
  applyDuelRequested,
  applyDuelStarted,
  duelOpponent,
  duelPhase,
  noteDuelChallenged,
  pvpNotice,
  resetPvp,
} from '../src/ui/pvpStore';

const THEM = 42;

beforeEach(() => {
  resetPvp();
});

describe('getting into a duel', () => {
  it('records that this client challenged somebody, since success is silent', () => {
    noteDuelChallenged(THEM);
    expect(duelPhase.value).toBe('challenged');
    expect(duelOpponent.value).toBe(THEM);
  });

  it('shows an incoming challenge as an invitation', () => {
    applyDuelRequested(THEM);
    expect(duelPhase.value).toBe('invited');
    expect(duelOpponent.value).toBe(THEM);
  });

  it('goes back to idle when the challenge is declined or expires', () => {
    noteDuelChallenged(THEM);
    applyDuelDeclined();
    expect(duelPhase.value).toBe('idle');
    expect(duelOpponent.value).toBeNull();
  });

  it('starts against whoever the server names', () => {
    applyDuelEnded('lost');
    applyDuelStarted(THEM);
    expect(duelPhase.value).toBe('duelling');
    expect(duelOpponent.value).toBe(THEM);
  });
});

describe('the duel ending', () => {
  it('returns to idle and says how it ended', () => {
    applyDuelStarted(THEM);
    applyDuelEnded('won');
    expect(duelPhase.value).toBe('idle');
    expect(duelOpponent.value).toBeNull();
    expect(pvpNotice.value).toContain('won');
  });

  it('says an unrecognised reason as the raw string the server sent', () => {
    applyDuelStarted(THEM);
    applyDuelEnded('arena_collapsed');
    expect(pvpNotice.value).toContain('arena_collapsed');
  });
});

describe('resetting', () => {
  it('forgets the duel and what was said about it', () => {
    applyDuelStarted(THEM);
    applyDuelEnded('lost');
    resetPvp();
    expect(duelPhase.value).toBe('idle');
    expect(duelOpponent.value).toBeNull();
    expect(pvpNotice.value).toBeNull();
  });
});
