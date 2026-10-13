import { describe, expect, it } from 'vitest';
import { groundHitDistance } from '../src/world/cameraGround';

describe('groundHitDistance', () => {
  it('is null over flat ground with the boom above it', () => {
    expect(groundHitDistance([0, 5, 0], [10, 5, 0], () => 0, 0.5)).toBeNull();
  });

  it('stops a boom that dips under flat ground where it crosses the clearance', () => {
    // Descends from y=5 to y=-5 over 10 units; crosses y=0.5 at 4.5 along x.
    const d = groundHitDistance([0, 5, 0], [0, -5, 0], () => 0, 0.5, 0.1);
    expect(d).toBeGreaterThan(4.4);
    expect(d).toBeLessThan(4.7);
  });

  it('catches a rising hillside behind the player', () => {
    const slope = (x: number) => x * 0.5;
    const d = groundHitDistance([0, 2, 0], [10, 2, 0], slope, 0.5, 0.1);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(2.5);
    expect(d!).toBeLessThan(3.5);
  });

  it('ignores positions with no terrain', () => {
    expect(groundHitDistance([0, -5, 0], [10, -5, 0], () => null, 0.5)).toBeNull();
  });
});

describe('groundHitDistance continuity', () => {
  it('changes smoothly as the boom origin moves, not in step-sized jumps', () => {
    const slope = (x: number) => x * 0.3;
    let last = groundHitDistance([0, 2, 0], [10, 2, 0], slope, 0.3)!;
    for (let i = 1; i <= 20; i++) {
      const d = groundHitDistance([i * 0.02, 2, 0], [10 + i * 0.02, 2, 0], slope, 0.3)!;
      expect(Math.abs(d - last)).toBeLessThan(0.1);
      last = d;
    }
  });
});
