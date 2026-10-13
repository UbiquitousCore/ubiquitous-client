import { describe, expect, it } from 'vitest';

import type { PiecePart } from '../../src/ui/art/piecePlan';
import {
  ringCentre,
  snapTurn,
  turnBetween,
  wheelRefs,
  wheelStates,
} from '../../src/ui/spellWheelModel';
import type { WheelNames, WheelView } from '../../src/ui/spellWheelModel';

const NAMES: WheelNames = {
  slot: 'skill',
  within: 'spellpanel',
  sweep: 'cooldown',
  effects: 'effect',
  flash: 'cooldownFinish',
  glow: 'autoAttack',
};

const part = (path: string): PiecePart => ({
  name: path.split('/').pop()!,
  path,
  box: { x: 0, y: 0, w: 1, h: 1 },
  draws: true,
});

describe('wheelRefs', () => {
  const parts = [
    'spellpanel',
    'spellpanel/skill10',
    'spellpanel/skill02',
    'spellpanel/skill01',
    'spellpanel/effect01',
  ].map(part);

  it('lists the slots in the order of their numbers', () => {
    expect(wheelRefs(parts, NAMES).map(slot => slot.path)).toEqual([
      'spellpanel/skill01',
      'spellpanel/skill02',
      'spellpanel/skill10',
    ]);
  });

  it('finds what lies in a slot and beside it by its number', () => {
    expect(wheelRefs(parts, NAMES)[1]).toMatchObject({
      index: 1,
      sweep: 'spellpanel/skill02/cooldown',
      effects: 'spellpanel/effect02',
      flash: 'spellpanel/effect02/cooldownFinish',
      glow: 'spellpanel/effect02/autoAttack',
    });
  });
});

describe('wheelStates', () => {
  const refs = wheelRefs(['spellpanel/skill01', 'spellpanel/skill02'].map(part), NAMES);
  const idle: WheelView = { sweep: null, glowing: false, flash: null };

  it('leaves every sweep, glow and flash out of the base, and draws nothing over an idle ring', () => {
    const { base, over } = wheelStates(refs, [idle, idle], ['tip']);
    expect(base.hidden).toEqual([
      'tip',
      'spellpanel/skill01/cooldown',
      'spellpanel/effect01/autoAttack',
      'spellpanel/effect01/cooldownFinish',
      'spellpanel/skill02/cooldown',
      'spellpanel/effect02/autoAttack',
      'spellpanel/effect02/cooldownFinish',
    ]);
    expect(over.only).toEqual([]);
  });

  it('draws the sweep at its face, the glow of a press and the flash at its face', () => {
    const { over } = wheelStates(
      refs,
      [
        { sweep: 30, glowing: true, flash: null },
        { ...idle, flash: 4 },
      ],
      [],
    );
    expect(over.only).toEqual([
      'spellpanel/skill01/cooldown',
      'spellpanel/effect01/autoAttack',
      'spellpanel/effect02/cooldownFinish',
    ]);
    expect(over.frames).toEqual({
      'spellpanel/skill01/cooldown': 30,
      'spellpanel/effect02/cooldownFinish': 4,
    });
  });
});

describe('turning the ring', () => {
  it('turns about the middle of its slots', () => {
    const boxes = [
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 8, y: 8, w: 2, h: 2 },
    ];
    expect(ringCentre(boxes)).toEqual({ x: 5, y: 5 });
    expect(ringCentre([])).toEqual({ x: 0, y: 0 });
  });

  it('measures how far a pointer has gone round, the short way', () => {
    const c = { x: 0, y: 0 };
    expect(turnBetween(c, { x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
    expect(turnBetween(c, { x: 1, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(-Math.PI / 2);
    // Across the seam at the back, it does not go all the way round.
    expect(turnBetween(c, { x: -1, y: -0.01 }, { x: -1, y: 0.01 })).toBeLessThan(0.1);
  });

  it('settles on the nearest place a slot stood', () => {
    const step = (Math.PI * 2) / 12;
    expect(snapTurn(step * 0.4, 12)).toBe(0);
    expect(snapTurn(step * 0.6, 12)).toBeCloseTo(step);
    expect(snapTurn(-step * 2.2, 12)).toBeCloseTo(-step * 2);
  });
});
