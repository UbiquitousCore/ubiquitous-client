import { describe, expect, it } from 'vitest';
import { GROUND_BLEND_MS, GroundLightBlend } from '../src/renderer/GroundLightBlend';

const RED = [1, 0, 0] as const;
const BLUE = [0, 0, 1] as const;

describe('the ground light across a zone border', () => {
  it('shows the first zone’s colours at once', () => {
    const blend = new GroundLightBlend();
    blend.adopt(RED, BLUE);
    expect(blend.step(16)).toBe(false);
    expect(blend.current).toEqual({ sun: RED, shade: BLUE });
  });

  it('fades a later zone’s in over the blend, halfway at half time', () => {
    const blend = new GroundLightBlend();
    blend.adopt(RED, RED);
    blend.adopt(BLUE, BLUE);
    expect(blend.current.sun).toEqual(RED);
    blend.step(GROUND_BLEND_MS / 2);
    expect(blend.current.sun[0]).toBeCloseTo(0.5);
    expect(blend.current.sun[2]).toBeCloseTo(0.5);
    blend.step(GROUND_BLEND_MS / 2);
    expect(blend.current).toEqual({ sun: BLUE, shade: BLUE });
    expect(blend.step(16)).toBe(false);
  });

  it('starts a new fade from what is on screen, not from the last zone’s', () => {
    const blend = new GroundLightBlend();
    blend.adopt(RED, RED);
    blend.adopt(BLUE, BLUE);
    blend.step(GROUND_BLEND_MS / 2);
    blend.adopt(RED, RED);
    expect(blend.current.sun[0]).toBeCloseTo(0.5);
  });
});
