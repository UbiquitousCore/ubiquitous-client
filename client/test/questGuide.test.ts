/**
 * Where the guide arrow points.
 *
 * The rules: the tracked quest only, its finish zone once the
 * objectives are met, the nearest unfinished guide zone until then, and never
 * a zone on another map.
 */

import { describe, expect, it } from 'vitest';
import { guidePlacement, guideTarget } from '../src/gameplay/questGuide';
import type { QuestRecord, QuestArea } from '../src/net/GameConnection';

function zone(over: Partial<QuestArea> = {}): QuestArea {
  return { id: 1, mapId: 2, x: 0, y: 0, z: 0, radius: 5, ...over };
}

function objective(index: number, done: number, wanted: number) {
  return {
    index,
    killed: done,
    triggered: 0,
    held: 0,
    objectiveItem: 0,
    objectiveItemCount: 0,
    goalCount: wanted,
    objectiveStringId: 0,
  };
}

function quest(over: Partial<QuestRecord> = {}): QuestRecord {
  return { id: 620, name: 'Sample Errand', status: 'incomplete', ...over };
}

const HERE: [number, number, number] = [0, 0, 0];

describe('choosing what to point at', () => {
  it('points at nothing when no quest is tracked', () => {
    expect(guideTarget(null, 2, HERE)).toBeNull();
  });

  it('points at the nearest guide zone while the quest is under way', () => {
    const target = guideTarget(
      quest({
        guideZones: [zone({ id: 1, x: 100, z: 0 }), zone({ id: 2, x: 10, z: 0 })],
        objectives: [objective(0, 0, 5), objective(1, 0, 5)],
      }),
      2,
      HERE,
    );
    expect(target?.id).toBe(2);
  });

  it('measures distance flat, so height cannot pick the wrong zone', () => {
    const target = guideTarget(
      quest({
        guideZones: [zone({ id: 1, x: 10, y: 900, z: 0 }), zone({ id: 2, x: 50, y: 0, z: 0 })],
        objectives: [objective(0, 0, 5), objective(1, 0, 5)],
      }),
      2,
      HERE,
    );
    expect(target?.id).toBe(1);
  });

  it('ignores a zone whose objective is already met', () => {
    // A finished step is not somewhere worth walking to, even if it is nearer.
    const target = guideTarget(
      quest({
        guideZones: [zone({ id: 1, x: 10, z: 0 }), zone({ id: 2, x: 100, z: 0 })],
        objectives: [objective(0, 5, 5), objective(1, 0, 5)],
      }),
      2,
      HERE,
    );
    expect(target?.id).toBe(2);
  });

  it('ignores zones on another map', () => {
    expect(
      guideTarget(
        quest({
          guideZones: [zone({ id: 1, mapId: 9, x: 10 })],
          objectives: [objective(0, 0, 5)],
        }),
        2,
        HERE,
      ),
    ).toBeNull();
  });

  it('switches to the finish zone once the objectives are met', () => {
    const target = guideTarget(
      quest({
        readyToHandIn: true,
        guideZones: [zone({ id: 1, x: 10 })],
        handInZone: zone({ id: 99, x: 500 }),
        objectives: [objective(0, 5, 5)],
      }),
      2,
      HERE,
    );
    expect(target?.id).toBe(99);
  });

  it('points at nothing when the hand-in is on another map', () => {
    expect(
      guideTarget(
        quest({
          readyToHandIn: true,
          handInZone: zone({ id: 99, mapId: 9 }),
        }),
        2,
        HERE,
      ),
    ).toBeNull();
  });

  it('points at nothing when a finishable quest has no finish zone', () => {
    expect(guideTarget(quest({ readyToHandIn: true, handInZone: null }), 2, HERE)).toBeNull();
  });
});

describe('placing the arrow', () => {
  it('sits eight tenths of a unit ahead of the player, not under them', () => {
    const placed = guidePlacement(zone({ x: 100, z: 0 }), HERE);
    expect(placed!.position[0]).toBeCloseTo(0.8);
    expect(placed!.position[2]).toBeCloseTo(0);
  });

  it('faces the target, nose first', () => {
    /*
     * THE BUG THIS PINS: the arrow pointed back at the player. The model's
     * nose is its -Z, so the yaw is the bearing to the target turned through
     * half a circle — aiming its +Z at the target aims its nose away.
     *
     * A target due north (+Z) therefore wants a yaw of pi, not zero.
     */
    const north = guidePlacement(zone({ x: 0, z: 100 }), HERE)!.yaw;
    expect(Math.abs(north)).toBeCloseTo(Math.PI);

    // Due south wants no turn at all, being where the nose already points.
    expect(guidePlacement(zone({ x: 0, z: -100 }), HERE)!.yaw).toBeCloseTo(0);

    // And the arrow still leads: it sits between the player and the target,
    // whichever way it is facing.
    const east = guidePlacement(zone({ x: 100, z: 0 }), HERE)!;
    expect(east.position[0]).toBeCloseTo(0.8);
    expect(east.yaw).toBeCloseTo(-Math.PI / 2);
  });

  it('floats a fifth of a unit above the player, not on the ground', () => {
    // The arrow is a model in the world rather than a decal, so it is lifted
    // rather than draped.
    expect(guidePlacement(zone({ x: 100 }), [5, 42, 5])!.position[1]).toBeCloseTo(42.2);
  });

  it('draws nothing when the player is standing on the target', () => {
    // A direction of zero length cannot be normalised, and an arrow built
    // from one spins with the floating-point noise.
    expect(guidePlacement(zone({ x: 0, z: 0 }), HERE)).toBeNull();
  });
});
