/**
 * A duel opponent is red — the ring under them and the name over them — for
 * as long as the duel lasts, and goes back to the colour of any other player
 * of the hero's side once it ends, however it ends.
 *
 * The relationship is decided once (`relationOf`, fed by `isDuellingMe`), and
 * both the ring and the name read it, so these tests follow one relationship
 * from the store to both colours.
 */

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { relationOf } from '../src/gameplay/relationship';
import {
  NAME_COLOURS,
  PLAYER_NAME_COLOUR,
  playerNameColour,
  recolourNameLabel,
  unitNameLabel,
} from '../src/renderer/nameLabels';
import {
  applyDuelDeclined,
  applyDuelEnded,
  applyDuelRequested,
  applyDuelStarted,
  isDuellingMe,
  noteDuelChallenged,
  resetPvp,
} from '../src/ui/pvpStore';
import type { DuelEndReason } from '../src/ui/pvpStore';

const MY_FACTION = 1;
const OPPONENT = 5;
const BYSTANDER = 6;

/** The relationship `Game.relationTo` works out for another player of the hero's own side. */
function relationToPlayer(networkId: number) {
  return relationOf(
    { kind: 'player', faction: MY_FACTION, duellingMe: isDuellingMe(networkId) },
    MY_FACTION,
  );
}

let painted: string[];

/** A canvas whose context records the colour each line is filled in. */
function recordingCanvas(): unknown {
  const context = {
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '',
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText() {
      painted.push(context.fillStyle);
    },
  };
  return { width: 300, height: 150, getContext: () => context };
}

beforeEach(() => {
  resetPvp();
  painted = [];
  vi.stubGlobal('document', { createElement: () => recordingCanvas() });
});

afterEach(() => {
  resetPvp();
  vi.unstubAllGlobals();
});

describe('a duel opponent', () => {
  it('is red, ring and name, once the duel starts', () => {
    expect(relationToPlayer(OPPONENT)).toBe('ally');
    applyDuelStarted(OPPONENT);

    expect(relationToPlayer(OPPONENT)).toBe('enemy');
    expect(playerNameColour(relationToPlayer(OPPONENT))).toBe(NAME_COLOURS['enemy']);
  });

  it('is nobody else: a bystander keeps the player colour', () => {
    applyDuelStarted(OPPONENT);
    expect(relationToPlayer(BYSTANDER)).toBe('ally');
    expect(playerNameColour(relationToPlayer(BYSTANDER))).toBe(PLAYER_NAME_COLOUR);
  });

  it('is not red while the challenge is only asked or only received', () => {
    noteDuelChallenged(OPPONENT);
    expect(relationToPlayer(OPPONENT)).toBe('ally');
    resetPvp();
    applyDuelRequested(OPPONENT);
    expect(relationToPlayer(OPPONENT)).toBe('ally');
    applyDuelDeclined();
    expect(relationToPlayer(OPPONENT)).toBe('ally');
  });

  it.each<DuelEndReason>(['won', 'lost', 'forfeited', 'opponentForfeited'])(
    'goes back to the player colour when the duel ends: %s',
    reason => {
      applyDuelStarted(OPPONENT);
      applyDuelEnded(reason);

      expect(relationToPlayer(OPPONENT)).toBe('ally');
      expect(playerNameColour(relationToPlayer(OPPONENT))).toBe(PLAYER_NAME_COLOUR);
    },
  );

  it('goes back to the player colour when the session is gone', () => {
    applyDuelStarted(OPPONENT);
    resetPvp();
    expect(relationToPlayer(OPPONENT)).toBe('ally');
  });
});

describe('another player’s name over their head', () => {
  it('is repainted red when the duel starts and in the player colour when it ends', () => {
    const label = unitNameLabel('Borin', undefined, PLAYER_NAME_COLOUR, 2);
    expect(painted).toEqual([PLAYER_NAME_COLOUR]);

    applyDuelStarted(OPPONENT);
    recolourNameLabel(label, playerNameColour(relationToPlayer(OPPONENT)));
    applyDuelEnded('won');
    recolourNameLabel(label, playerNameColour(relationToPlayer(OPPONENT)));

    expect(painted).toEqual([PLAYER_NAME_COLOUR, NAME_COLOURS['enemy'], PLAYER_NAME_COLOUR]);
  });

  it('is not drawn again while its colour holds', () => {
    const label = unitNameLabel('Borin', undefined, PLAYER_NAME_COLOUR, 2);
    const texture = (label.material as THREE.SpriteMaterial).map;
    recolourNameLabel(label, PLAYER_NAME_COLOUR);
    expect(painted).toEqual([PLAYER_NAME_COLOUR]);
    expect((label.material as THREE.SpriteMaterial).map).toBe(texture);
  });
});
