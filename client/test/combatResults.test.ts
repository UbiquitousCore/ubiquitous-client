/**
 * What each named outcome means for the defender: which clip plays, which
 * spark it throws, and whether it counts as a heal or a critical.
 */

import { describe, expect, it } from 'vitest';

import {
  REACTION_CLIPS,
  SPARK_FILES,
  defendReaction,
  isCritical,
  restoresHealth,
  showsANumber,
  turnedAside,
} from '../src/gameplay/combatResults';
import { OUTCOMES } from '../src/net/wireCodes';

describe('heals and criticals', () => {
  it('counts both kinds of heal as heals, and nothing else', () => {
    expect(OUTCOMES.filter(restoresHealth)).toEqual(['heal', 'periodicHeal']);
    expect(restoresHealth(null)).toBe(false);
  });

  it('counts only a critical as a critical', () => {
    expect(OUTCOMES.filter(isCritical)).toEqual(['critical']);
  });
});

describe('whether a blow gets a number', () => {
  it('numbers a blow a shield took whole, and one it took part of', () => {
    expect(showsANumber(0, 20)).toBe(true);
    expect(showsANumber(10, 10)).toBe(true);
  });

  it('numbers any change to health, and nothing that changed nothing', () => {
    expect(showsANumber(30, 0)).toBe(true);
    expect(showsANumber(-30, 0)).toBe(true);
    expect(showsANumber(0, 0)).toBe(false);
  });
});

describe('the defender’s reaction', () => {
  it('flinches and sparks when a blow lands, critical or not', () => {
    for (const outcome of ['hit', 'critical'] as const) {
      expect(defendReaction(outcome, false)).toEqual({
        clip: REACTION_CLIPS.flinchIdle,
        spark: SPARK_FILES.landed,
      });
    }
  });

  it('flinches from its battle stance when it is fighting', () => {
    expect(defendReaction('hit', true)?.clip).toBe(REACTION_CLIPS.flinchFighting);
    expect(defendReaction('hit', true)?.clip).not.toBe(defendReaction('hit', false)?.clip);
  });

  it('dodges, parries or blocks with a move of its own', () => {
    expect(defendReaction('dodge', false)).toEqual({ clip: REACTION_CLIPS.dodge });
    expect(defendReaction('parry', false)).toEqual({
      clip: REACTION_CLIPS.parry,
      spark: SPARK_FILES.parried,
    });
    expect(defendReaction('block', false)).toEqual({ clip: REACTION_CLIPS.shieldBlock });
  });

  it('stands still for a miss, a heal, or an outcome it does not know', () => {
    for (const outcome of ['miss', 'heal', 'periodicHeal', null] as const) {
      expect(defendReaction(outcome, false)).toBeNull();
      expect(defendReaction(outcome, true)).toBeNull();
    }
  });

  it('only a parry and a landed blow spark', () => {
    const sparking = OUTCOMES.filter(o => defendReaction(o, false)?.spark !== undefined);
    expect(sparking).toEqual(['hit', 'parry', 'critical']);
  });
});

describe('a blow turned aside', () => {
  it('is a miss, a dodge, a parry or a block, and nothing else', () => {
    expect(OUTCOMES.filter(outcome => turnedAside(outcome) !== null)).toEqual([
      'miss',
      'dodge',
      'parry',
      'block',
    ]);
    expect(turnedAside(null)).toBeNull();
  });
});
