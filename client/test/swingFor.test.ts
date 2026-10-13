import { describe, expect, it } from 'vitest';

import { ATTACK_CLIPS, SwingQueue, attackerClipFor, swingFor } from '../src/gameplay/combatResults';
import { OFF_HAND_SWING, swingsOffHand } from '../src/gameplay/weaponClips';

describe('swingFor', () => {
  it('splits ordinary blows evenly between the two swings', () => {
    expect(swingFor('hit', 0)).toBe(ATTACK_CLIPS.swings[0]);
    expect(swingFor('hit', 0.49)).toBe(ATTACK_CLIPS.swings[0]);
    expect(swingFor('hit', 0.5)).toBe(ATTACK_CLIPS.swings[1]);
    expect(swingFor('miss', 0.99)).toBe(ATTACK_CLIPS.swings[1]);
  });

  it('plays the heavier swing for a critical', () => {
    expect(swingFor('critical', 0)).toBe(ATTACK_CLIPS.critical);
    expect(swingFor('critical', 0.9)).toBe(ATTACK_CLIPS.critical);
  });
});

describe('attackerClipFor', () => {
  it('swings for a main-hand blow', () => {
    expect(attackerClipFor('hit', 'main', 0)).toBe(ATTACK_CLIPS.swings[0]);
    expect(attackerClipFor('critical', 'main', 0)).toBe(ATTACK_CLIPS.critical);
  });

  it('swings the off hand for an off-hand blow, where the off hand has a swing', () => {
    expect(attackerClipFor('hit', 'off', 0, true)).toBe(OFF_HAND_SWING);
    expect(attackerClipFor('critical', 'off', 0, true)).toBe(OFF_HAND_SWING);
  });

  it('plays nothing for an off-hand blow where the off hand has no swing', () => {
    expect(attackerClipFor('hit', 'off', 0, false)).toBeNull();
  });
});

describe('swingsOffHand', () => {
  const hands = (offhand: '' | '1h' | '2h' | 'dagger' | 'stave') => ({
    mainhand: '1h' as const,
    offhand,
    ranged: '' as const,
  });

  it('is true for the families that ship an off-hand swing', () => {
    expect(swingsOffHand(hands('dagger'))).toBe(true);
    expect(swingsOffHand(hands('1h'))).toBe(true);
    expect(swingsOffHand(hands('stave'))).toBe(true);
  });

  it('is false for a shield, a two-hander, or a body that keeps the bare names', () => {
    expect(swingsOffHand(hands(''))).toBe(false);
    expect(swingsOffHand(hands('2h'))).toBe(false);
    expect(swingsOffHand(null)).toBe(false);
  });
});

describe('SwingQueue', () => {
  it('starts a main-hand swing at once, even over one still running', () => {
    const swings = new SwingQueue();
    expect(swings.wait(7, 'main', 0, 800)).toBe(0);
    expect(swings.wait(7, 'main', 300, 800)).toBe(0);
  });

  it('starts an off-hand swing once the swing still running has ended', () => {
    const swings = new SwingQueue();
    expect(swings.wait(7, 'main', 0, 800)).toBe(0);
    // Both hands' blows together: the second swing follows the first.
    expect(swings.wait(7, 'off', 50, 700)).toBe(750);
    // And the next main-hand swing starts whenever it is asked for.
    expect(swings.wait(7, 'main', 1000, 800)).toBe(0);
    // An off-hand blow after everything has ended swings at once.
    expect(swings.wait(7, 'off', 5000, 700)).toBe(0);
  });

  it('keeps each body to its own swings, and forgets one that stops fighting', () => {
    const swings = new SwingQueue();
    swings.wait(7, 'main', 0, 800);
    expect(swings.wait(8, 'off', 100, 700)).toBe(0);
    swings.stopped(7);
    expect(swings.wait(7, 'off', 100, 700)).toBe(0);
  });
});
