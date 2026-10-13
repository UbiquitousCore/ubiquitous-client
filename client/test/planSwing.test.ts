import { describe, expect, it } from 'vitest';

import {
  ATTACK_CLIPS,
  SWING_UNKNOWN_MS,
  SwingQueue,
  planSwing,
} from '../src/gameplay/combatResults';
import { OFF_HAND_SWING, UNARMED, type EquippedWeapons } from '../src/gameplay/weaponClips';

const daggers: EquippedWeapons = { ...UNARMED, offhand: 'dagger' };
const pole: EquippedWeapons = { ...UNARMED, offhand: 'polearm' };

function plan(over: Partial<Parameters<typeof planSwing>[0]> = {}) {
  return planSwing({
    outcome: 'hit',
    hand: 'main',
    roll: 0,
    weapons: UNARMED,
    clipSeconds: () => 0.5,
    queue: new SwingQueue(),
    attacker: 1,
    now: 1000,
    ...over,
  });
}

describe('planSwing', () => {
  it('plays a main-hand swing at once', () => {
    expect(plan()).toEqual({ clip: ATTACK_CLIPS.swings[0], waitMs: 0 });
  });

  it('plays the critical clip for a critical', () => {
    expect(plan({ outcome: 'critical' })?.clip).toBe(ATTACK_CLIPS.critical);
  });

  it('shows no swing for an off-hand blow where the body has no off-hand swing', () => {
    expect(plan({ hand: 'off', weapons: pole })).toBeNull();
    expect(plan({ hand: 'off', weapons: null })).toBeNull();
  });

  it('swings the off hand where the body has one', () => {
    expect(plan({ hand: 'off', weapons: daggers })?.clip).toBe(OFF_HAND_SWING);
  });

  it('holds an off-hand swing back until the main-hand swing that arrived with it ends', () => {
    const queue = new SwingQueue();
    plan({ queue, clipSeconds: () => 0.6 });
    const second = plan({ queue, hand: 'off', weapons: daggers, now: 1100 });
    expect(second?.waitMs).toBe(500);
  });

  it('takes a clip that has not loaded to last the unknown-swing time', () => {
    const queue = new SwingQueue();
    plan({ queue, clipSeconds: () => null });
    expect(plan({ queue, hand: 'off', weapons: daggers, now: 1000 })?.waitMs).toBe(
      SWING_UNKNOWN_MS,
    );
  });

  it('books nothing for a blow that shows no swing', () => {
    const queue = new SwingQueue();
    plan({ queue, hand: 'off', weapons: pole });
    expect(plan({ queue, hand: 'off', weapons: daggers, now: 1000 })?.waitMs).toBe(0);
  });
});
