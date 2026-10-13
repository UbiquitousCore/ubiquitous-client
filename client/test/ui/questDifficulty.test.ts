/**
 * The colour a quest's name wears in the log, from how far its level sits
 * from the character's.
 */

import { describe, expect, it } from 'vitest';

import { DIFFICULTY_TEXT, questDifficulty } from '../../src/ui/questDifficulty';

describe('questDifficulty', () => {
  it('counts two levels either side as your level', () => {
    expect(questDifficulty(10, 10)).toBe('fair');
    expect(questDifficulty(12, 10)).toBe('fair');
    expect(questDifficulty(8, 10)).toBe('fair');
  });

  it('warns more the further a quest sits above you', () => {
    expect(questDifficulty(13, 10)).toBe('hard');
    expect(questDifficulty(14, 10)).toBe('hard');
    expect(questDifficulty(15, 10)).toBe('deadly');
    expect(questDifficulty(40, 10)).toBe('deadly');
  });

  it('greys out a quest eight or more levels below you', () => {
    expect(questDifficulty(7, 10)).toBe('easy');
    expect(questDifficulty(3, 10)).toBe('easy');
    expect(questDifficulty(2, 10)).toBe('trivial');
    expect(questDifficulty(1, 60)).toBe('trivial');
  });

  it('gives every band its own theme colour', () => {
    const classes = Object.values(DIFFICULTY_TEXT);
    expect(new Set(classes).size).toBe(classes.length);
    for (const c of classes) expect(c).toMatch(/^text-[a-z]+(-[a-z0-9]+)*$/);
  });
});
