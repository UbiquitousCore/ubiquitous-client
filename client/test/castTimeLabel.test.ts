import { describe, expect, it } from 'vitest';
import { castTimeLabel } from '../src/gameplay/SpellBook';

describe('castTimeLabel', () => {
  it('says instant, or the seconds a cast takes', () => {
    expect(castTimeLabel(0)).toBe('Instant');
    expect(castTimeLabel(1500)).toBe('1.5s cast');
    expect(castTimeLabel(2000)).toBe('2s cast');
    expect(castTimeLabel(undefined)).toBeUndefined();
  });
});
