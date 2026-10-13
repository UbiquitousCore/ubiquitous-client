import { describe, expect, it } from 'vitest';

import { castTargetFromBar } from '../src/app/helpers/combat/castSpellFromBar';

describe('castTargetFromBar', () => {
  it('refuses spells missing from the bar', () => {
    const out = castTargetFromBar({
      spellId: 10,
      bar: [11, 12],
      mayStartCast: true,
      hudTargetId: null,
      networkIdOf: () => 77,
    });
    expect(out).toBeNull();
  });

  it('refuses when another cast is already underway', () => {
    const out = castTargetFromBar({
      spellId: 10,
      bar: [10, 12],
      mayStartCast: false,
      hudTargetId: '3',
      networkIdOf: () => 77,
    });
    expect(out).toBeNull();
  });

  it('casts on self (wire target 0) without a target', () => {
    const out = castTargetFromBar({
      spellId: 10,
      bar: [10, 12],
      mayStartCast: true,
      hudTargetId: null,
      networkIdOf: () => 77,
    });
    expect(out).toBe(0);
  });

  it('casts on self (wire target 0) when target has no network id', () => {
    const out = castTargetFromBar({
      spellId: 10,
      bar: [10, 12],
      mayStartCast: true,
      hudTargetId: '3',
      networkIdOf: () => undefined,
    });
    expect(out).toBe(0);
  });

  it('casts on the target when it has a network id', () => {
    const out = castTargetFromBar({
      spellId: 10,
      bar: [10, 12],
      mayStartCast: true,
      hudTargetId: '3',
      networkIdOf: id => (id === 3 ? 88 : undefined),
    });
    expect(out).toBe(88);
  });
});
