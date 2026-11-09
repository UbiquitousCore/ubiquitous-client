/** Sitting down to a meal and getting up from it, from the server's `eating` value. */

import { describe, expect, it } from 'vitest';

import { mealAfter, mealPosture } from '../src/gameplay/auraState';
import type { MealState } from '../src/world/World';
import { cueClips, cueFor } from '../src/gameplay/ClipMachine';

describe('a meal', () => {
  it('sits on 1 and rises on 0', () => {
    expect(mealAfter(null, { eating: 1 })).toBe('eating');
    expect(mealAfter('eating', { eating: 0 })).toBe('rising');
  });

  it('does not rise for a body that was not sitting', () => {
    expect(mealAfter(null, { eating: 0 })).toBeNull();
  });

  it('says nothing when the values do not', () => {
    expect(mealAfter('eating', { health: 5 })).toBeUndefined();
  });

  it('holds the seat while standing still', () => {
    const body = { networkMeal: 'eating' as MealState };
    expect(mealPosture(body, true)).toBe('eating');
    expect(mealPosture(body, true)).toBe('eating');
  });

  it('asks to rise once only', () => {
    const body = { networkMeal: 'rising' as MealState };
    expect(mealPosture(body, true)).toBe('rising');
    expect(mealPosture(body, true)).toBeNull();
  });

  it('leaves the table without rising when the body moves', () => {
    const body = { networkMeal: 'eating' as MealState };
    expect(mealPosture(body, false)).toBeNull();
    expect(mealAfter(body.networkMeal, { eating: 0 })).toBeNull();
  });

  it('sits, eats, and stands with the clips made for it', () => {
    expect(cueClips(cueFor('foot', 'eating', 'stop'))).toEqual([
      'emote_eat_start',
      'emote_eat_hold',
    ]);
    expect(cueClips(cueFor('foot', 'rising', 'stop'))).toEqual(['emote_eat_stand', 'idle']);
  });
});
