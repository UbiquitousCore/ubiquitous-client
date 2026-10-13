import { describe, expect, it } from 'vitest';

import { cooldownLabel, spellCardLines } from '../src/ui/spellCard';

describe("the spell card's lines", () => {
  it('puts each figure on the line whose picture says what it is', () => {
    expect(
      spellCardLines(
        { powerCost: 40, castMs: 1500, cooldownMs: 8000, range: 30, mount: false },
        { range: 'Range:' },
      ),
    ).toEqual({ cost: '40', range: 'Range: 30', cast: '1.5s cast', cooldown: '8s cooldown' });
  });

  it('leaves the line empty for what a spell has none of, and says an instant is one', () => {
    expect(spellCardLines({ powerCost: 0, castMs: 0, cooldownMs: 0, range: 0, mount: false }, {})).toEqual({
      cost: '',
      range: '',
      cast: 'Instant',
      cooldown: '',
    });
  });

  it('says nothing until the figures arrive', () => {
    expect(spellCardLines(undefined, {})).toEqual({ cost: '', range: '', cast: '', cooldown: '' });
  });
});

describe('a cooldown', () => {
  it('is said in its largest whole unit', () => {
    expect(cooldownLabel(1500)).toBe('1.5s');
    expect(cooldownLabel(30_000)).toBe('30s');
    expect(cooldownLabel(180_000)).toBe('3 min');
    expect(cooldownLabel(90_000)).toBe('90s');
    expect(cooldownLabel(3_600_000)).toBe('1 h');
  });
});
