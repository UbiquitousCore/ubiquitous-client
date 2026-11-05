import { describe, expect, it } from 'vitest';
import { switchTargetPick, type SwitchCandidate } from '../src/gameplay/switchTarget';

const foe = (id: number, x: number, attackable = true): SwitchCandidate => ({
  id,
  position: [x, 0, 0],
  attackable,
});

describe('switchTargetPick', () => {
  const near = foe(1, 10);
  const middle = foe(2, 20);
  const far = foe(3, 30);

  it('picks the nearest enemy in reach when none of them is the target', () => {
    expect(switchTargetPick([far, near, middle], [0, 0, 0], 60, null)).toBe(1);
    expect(switchTargetPick([far, near, middle], [0, 0, 0], 60, 99)).toBe(1);
  });

  it('moves on to the next one out on each press, and back round after the farthest', () => {
    const all = [far, near, middle];
    expect(switchTargetPick(all, [0, 0, 0], 60, 1)).toBe(2);
    expect(switchTargetPick(all, [0, 0, 0], 60, 2)).toBe(3);
    expect(switchTargetPick(all, [0, 0, 0], 60, 3)).toBe(1);
  });

  it('leaves out anything beyond reach and anything that cannot be attacked', () => {
    expect(switchTargetPick([foe(1, 61), foe(2, 5, false), foe(3, 40)], [0, 0, 0], 60, null)).toBe(
      3,
    );
  });

  it('picks nothing when no enemy is in reach', () => {
    expect(switchTargetPick([foe(1, 80), foe(2, 5, false)], [0, 0, 0], 60, null)).toBeNull();
  });

  it('keeps the only enemy in reach as the target', () => {
    expect(switchTargetPick([near], [0, 0, 0], 60, 1)).toBe(1);
  });
});
