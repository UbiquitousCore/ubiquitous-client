/**
 * @vitest-environment happy-dom
 */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameHud } from '../../src/ui/GameHud';
import {
  clearTarget,
  setPlayer,
  setTarget,
  setWorldUnits,
  worldUnits,
} from '../../src/ui/hudStore';
import type { Unit } from '../../src/ui/hudStore';

const HERO: Unit = {
  id: 'hero',
  name: 'Naevia',
  level: 60,
  health: 4200,
  maxHealth: 5000,
  mana: 1800,
  maxMana: 2400,
  disposition: 'friendly',
};

const MOB: Unit = {
  id: 'mob-1',
  name: 'Rock Elemental',
  level: 62,
  health: 8200,
  maxHealth: 12_000,
  mana: 0,
  maxMana: 0,
  disposition: 'hostile',
};

beforeEach(() => {
  setPlayer(null);
  setWorldUnits([]);
  clearTarget();
});

afterEach(cleanup);

/**
 * A dead mob's portrait drops the in-combat marker once the server says so.
 *
 * The HUD shows the target frame's combat marker exactly while the unit is
 * flagged in combat, and the flag is server state: the client waits for the
 * server's out-of-combat message rather than clearing it on death.
 *
 * The store's change filter compares `inCombat`, so a body whose only change
 * is entering or leaving a fight is republished to the frame.
 */
describe('the target frame and the in-combat flag', () => {
  it('publishes a body whose only change is that it left the fight', () => {
    setWorldUnits([{ ...MOB, inCombat: true }]);

    setWorldUnits([{ ...MOB, inCombat: false }]);

    expect(worldUnits.value[0].inCombat).toBe(false);
  });

  it('publishes a body whose only change is that it entered one', () => {
    setWorldUnits([MOB]);

    setWorldUnits([{ ...MOB, inCombat: true }]);

    expect(worldUnits.value[0].inCombat).toBe(true);
  });

  it('still skips the republish when nothing at all moved', () => {
    // The filter exists to keep an unchanged world from re-rendering the HUD
    // sixty times a second; widening it must not cost that.
    setWorldUnits([{ ...MOB, inCombat: true }]);
    const published = worldUnits.value;

    setWorldUnits([{ ...MOB, inCombat: true }]);

    expect(worldUnits.value).toBe(published);
  });

  it('still frames a body selected after it was already dead', () => {
    setPlayer(HERO);
    setWorldUnits([{ ...MOB, health: 0, dead: true }]);
    setTarget(MOB.id);
    const { container } = render(<GameHud />);

    expect(container.querySelector('[data-hud="target"]')).not.toBeNull();
  });
});
