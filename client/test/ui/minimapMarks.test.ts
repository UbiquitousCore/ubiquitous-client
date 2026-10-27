import { describe, expect, it } from 'vitest';
import {
  arrowTurn,
  minimapBackground,
  minimapMark,
  RIM_RADIUS,
} from '../../src/ui/components/minimapMarks';
import { minimapPatch, minimapWindow } from '../../src/world/minimap';

const HALF = 100;
const PLAYER: [number, number, number] = [500, 0, 500];

describe('minimapMark', () => {
  it('offsets a thing from the centre in disc radii, south positive', () => {
    const mark = minimapMark('service', [550, 0, 450], PLAYER, HALF)!;
    expect(mark.x).toBeCloseTo(0.5, 6);
    expect(mark.y).toBeCloseTo(-0.5, 6);
    expect(mark.pointing).toBe(false);
  });

  it('leaves a service or a stop off once it is past the edge', () => {
    expect(minimapMark('service', [PLAYER[0] + HALF + 1, 0, PLAYER[2]], PLAYER, HALF)).toBeNull();
    expect(minimapMark('teleport', [PLAYER[0], 0, PLAYER[2] - 2 * HALF], PLAYER, HALF)).toBeNull();
  });

  it('keeps a quest place that is past the edge as an arrow on the rim pointing at it', () => {
    const east = minimapMark('quest', [PLAYER[0] + 5 * HALF, 0, PLAYER[2]], PLAYER, HALF)!;
    expect(east.pointing).toBe(true);
    expect(east.x).toBeCloseTo(RIM_RADIUS, 6);
    expect(east.y).toBeCloseTo(0, 6);
    expect(east.bearing).toBeCloseTo(Math.PI / 2, 6);

    // Up the map is north, which is toward lower Z.
    const north = minimapMark('quest', [PLAYER[0], 0, PLAYER[2] - 5 * HALF], PLAYER, HALF)!;
    expect(north.y).toBeCloseTo(-RIM_RADIUS, 6);
    expect(north.bearing).toBeCloseTo(0, 6);
  });

  it('draws a quest place the disc holds where it stands', () => {
    const near = minimapMark('quest', [PLAYER[0] + 20, 0, PLAYER[2]], PLAYER, HALF)!;
    expect(near.pointing).toBe(false);
    expect(near.x).toBeCloseTo(0.2, 6);
  });

  it('turns a quest place that is just under the edge into an arrow rather than losing it', () => {
    const edge = minimapMark('quest', [PLAYER[0] + 0.95 * HALF, 0, PLAYER[2]], PLAYER, HALF)!;
    expect(edge.pointing).toBe(true);
  });
});

describe('minimapBackground', () => {
  const windowAt = (x: number, z: number) => minimapWindow(x, z, 1, minimapPatch(x, z, 1));

  it('puts the player at the centre of the disc wherever they stand', () => {
    // The composite's own centre must land at 50%, and the scale must be the
    // reciprocal of the visible window so the window fills the element.
    const window = windowAt(64, 64);
    expect(window.u).toBeCloseTo(0.5, 6);
    expect(window.v).toBeCloseTo(0.5, 6);
    const { position, size } = minimapBackground(window);
    expect(position).toBe('50% 50%');
    expect(size).toBe(`${100 / (2 * window.radius)}% ${100 / (2 * window.radius)}%`);
  });

  it('slides the window east as the player walks east', () => {
    const patch = minimapPatch(64, 64, 1);
    const west = minimapBackground(minimapWindow(50, 64, 1, patch));
    const east = minimapBackground(minimapWindow(78, 64, 1, patch));
    expect(parseFloat(west.position)).toBeLessThan(parseFloat(east.position));
  });
});

describe('arrowTurn', () => {
  it('points south at yaw zero and east at a quarter turn', () => {
    expect(Math.abs(arrowTurn(0))).toBeCloseTo(Math.PI, 6);
    expect(arrowTurn(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
    expect(arrowTurn(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('keeps a teammate past the edge as a mark on the rim, and drops other things there', () => {
    const away = minimapMark('member', [PLAYER[0] + 5 * HALF, 0, PLAYER[2]], PLAYER, HALF)!;
    expect(away.pointing).toBe(true);
    expect(away.x).toBeCloseTo(RIM_RADIUS, 6);
    expect(minimapMark('service', [PLAYER[0] + 5 * HALF, 0, PLAYER[2]], PLAYER, HALF)).toBeNull();
  });
});
