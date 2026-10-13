/**
 * Both mouse buttons together walk you the way you are looking.
 */

import { describe, expect, it } from 'vitest';
import { bothButtons } from '../src/gameplay/Input';

describe('bothButtons', () => {
  it('is true only with the left and right buttons both down', () => {
    expect(bothButtons(3)).toBe(true);
    expect(bothButtons(1)).toBe(false);
    expect(bothButtons(2)).toBe(false);
    expect(bothButtons(0)).toBe(false);
    // The middle button along for the ride changes nothing.
    expect(bothButtons(7)).toBe(true);
  });
});
