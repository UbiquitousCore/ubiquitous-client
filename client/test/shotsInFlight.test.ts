/**
 * What a shooter's body plays for a shot, on every screen that sees it.
 *
 * Only the shooter's own screen is told a shot left; every other screen,
 * the target's included, hears only where it landed. A body another player
 * sees shooting must still be seen to shoot, with the weapon in its ranged
 * slot, and not to swing the one in its hand.
 */

import { describe, expect, it } from 'vitest';

import { ATTACK_CLIPS, attackerClipFor, ShotsInFlight } from '../src/gameplay/combatResults';
import { combatClipName, weaponsFromHands } from '../src/gameplay/weaponClips';

const REMOTE = 7;
const WEAPON = 2;
/** A sword in the main hand, nothing in the off hand, a bow in the ranged slot. */
const archer = weaponsFromHands({
  mainhand: { entry: 1, itemClass: WEAPON, subClass: 1 },
  offhand: { entry: 0, itemClass: 0, subClass: 0 },
  ranged: { entry: 2, itemClass: WEAPON, subClass: 16 },
});

describe('ShotsInFlight', () => {
  it('shoots with the bow for a shot that landed from a player whose shot was not seen leaving', () => {
    const clip = new ShotsInFlight().landed(REMOTE);
    expect(clip).toBe(ATTACK_CLIPS.shoot);
    expect(combatClipName(clip!, archer)).toBe('combat_fire_bow');
  });

  it('swings the sword, not the bow, for a melee blow from the same player', () => {
    const clip = attackerClipFor('hit', 'main', 0);
    expect(combatClipName(clip!, archer)).toBe(`${ATTACK_CLIPS.swings[0]}_1h`);
  });

  it('plays nothing on landing for a shot whose leaving already played it', () => {
    const shots = new ShotsInFlight();
    shots.left(REMOTE);
    expect(shots.landed(REMOTE)).toBeNull();
    // The next one was not seen leaving, so it shoots as it lands.
    expect(shots.landed(REMOTE)).toBe(ATTACK_CLIPS.shoot);
  });

  it('counts each shot seen leaving once, however many are in the air', () => {
    const shots = new ShotsInFlight();
    shots.left(REMOTE);
    shots.left(REMOTE);
    expect(shots.landed(REMOTE)).toBeNull();
    expect(shots.landed(REMOTE)).toBeNull();
    expect(shots.landed(REMOTE)).toBe(ATTACK_CLIPS.shoot);
  });

  it('keeps each shooter apart', () => {
    const shots = new ShotsInFlight();
    shots.left(REMOTE);
    expect(shots.landed(REMOTE + 1)).toBe(ATTACK_CLIPS.shoot);
    expect(shots.landed(REMOTE)).toBeNull();
  });

  it('forgets the shots of a shooter who stopped, so one that never landed costs no later shot its clip', () => {
    const shots = new ShotsInFlight();
    shots.left(REMOTE);
    shots.stopped(REMOTE);
    expect(shots.landed(REMOTE)).toBe(ATTACK_CLIPS.shoot);
  });
});
