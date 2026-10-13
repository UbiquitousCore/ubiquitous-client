/**
 * The animation translation is the subtlest code in the client: key units
 * vs seconds, conjugated quaternions, per-component patches and an angle
 * about the bind axis. Each was worked out from the user's files, and each is
 * invisible when wrong — a character simply stands still or bends the wrong way. These
 * tests pin all of it.
 */

import { describe, expect, it } from 'vitest';

import { toAnimationClip, toNodeAnimation, toSkeleton } from '../src/assets/providers/skeletonWire';
import type { MorphBindings, WireClip, WireSkeleton } from '../src/assets/providers/skeletonWire';

/** Channel kinds, by the numbers the files give them. */
const OFFSET = 1,
  OFFSET_Y = 3;
const TURN = 5,
  ANGLE_ON_BIND_AXIS = 9;
const SIZE = 10;

/** A two-bone skeleton: root with one child. */
const WIRE: WireSkeleton = {
  roots: [
    {
      id: 'root-node',
      name: 'root',
      sid: 'Bone0',
      translation: [0, 1, 0],
      // Stored conjugated; a 90-degree turn about Y.
      rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      scale: [1, 1, 1],
      children: [
        {
          id: 'child-node',
          name: 'child',
          sid: 'Bone1',
          translation: [2, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          children: [],
        },
      ],
    },
  ],
  skins: {
    'mesh-skin': {
      name: 'mesh-skin',
      source: '#body-mesh',
      jointNames: ['Bone0', 'Bone1'],
      bindPoses: [
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0],
        [1, 0, 0, 0, 1, 0, 0, 0, 1, -2, -1, 0],
      ],
      bindShape: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      weights: [
        { indices: [0, 1, 0, 0], weights: [0.75, 0.25, 0, 0] },
        { indices: [1, 0, 0, 0], weights: [1, 0, 0, 0] },
      ],
    },
  },
};

function clip(
  target: string,
  type: number,
  times: number[],
  values: number[],
  components: number,
): WireClip {
  return {
    id: `${target}-${type}`,
    channels: [{ target, type }],
    samplers: [
      {
        input: { components: 1, values: times },
        output: { components, values },
      },
    ],
  };
}

describe('toSkeleton', () => {
  const skeleton = toSkeleton('model/x.bdae', WIRE);

  it('flattens the tree with parent indices', () => {
    expect(skeleton.bones.map(b => b.id)).toEqual(['root-node', 'child-node']);
    expect(skeleton.bones[0].parent).toBe(-1);
    expect(skeleton.bones[1].parent).toBe(0);
  });

  it('un-conjugates stored quaternions once, at the boundary', () => {
    // Stored rotations are conjugated.
    const [x, y, z, w] = skeleton.bones[0].quaternion;
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(z).toBeCloseTo(0, 6);
    expect(w).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('resolves skin joints by sid and widens 3x4 bind poses to 4x4', () => {
    const skin = skeleton.skins[0];
    expect(skin.mesh).toBe('body-mesh');
    expect(skin.joints).toEqual([0, 1]);
    expect(skin.inverseBind).toHaveLength(2 * 16);
    // Row 0 of the widened matrix keeps its basis and gains a 0.
    expect(Array.from(skin.inverseBind.slice(0, 4))).toEqual([1, 0, 0, 0]);
    // The translation row lands in the last four slots, ending in 1.
    expect(Array.from(skin.inverseBind.slice(12, 16))).toEqual([0, -1, 0, 1]);
  });

  it('packs four skin influences per vertex', () => {
    const skin = skeleton.skins[0];
    expect(Array.from(skin.skinIndices)).toEqual([0, 1, 0, 0, 1, 0, 0, 0]);
    expect(Array.from(skin.skinWeights.slice(0, 2))).toEqual([0.75, 0.25]);
  });
});

describe('toAnimationClip', () => {
  const skeleton = toSkeleton('model/x.bdae', WIRE);

  it('reads curve times as ticks at 30 per second, not as seconds', () => {
    // A clip spanning 0..60 ticks is two seconds long. Treating the numbers as
    // seconds plays it thirty times too slowly, which reads as "not animating".
    const result = toAnimationClip(
      'idle',
      [clip('root-node', OFFSET, [0, 30, 60], [0, 0, 0, 0, 1, 0, 0, 2, 0], 3)],
      skeleton,
    );

    expect(result.duration).toBeCloseTo(2, 6);
    const track = result.tracks.find(t => t.property === 'position')!;
    expect(Array.from(track.times)).toEqual([0, 1, 2]);
  });

  it('ignores single-key curves when measuring duration', () => {
    // A one-key curve is a constant pose that holds. Letting it set the length
    // would leave every other bone frozen waiting for the loop to come round.
    const result = toAnimationClip(
      'idle',
      [
        clip('root-node', OFFSET, [90], [0, 5, 0], 3),
        clip('child-node', OFFSET, [0, 30], [0, 0, 0, 0, 1, 0], 3),
      ],
      skeleton,
    );

    expect(result.duration).toBeCloseTo(1, 6);
  });

  it('patches a single component and leaves the rest at the bind pose', () => {
    const result = toAnimationClip(
      'idle',
      [clip('child-node', OFFSET_Y, [0, 30], [7, 9], 1)],
      skeleton,
    );

    const track = result.tracks.find(t => t.property === 'position')!;
    // Bind translation is [2, 0, 0]; only Y is animated.
    expect(Array.from(track.values.slice(0, 3))).toEqual([2, 7, 0]);
    expect(Array.from(track.values.slice(3, 6))).toEqual([2, 9, 0]);
  });

  it('patches one offset axis with kinds 2-4 and one quaternion component with 7 and 8', () => {
    // Each drives one component of the child, whose bind pose is
    // translation [2, 0, 0], identity rotation and unit scale.
    for (const [kind, component] of [
      [2, 0],
      [3, 1],
      [4, 2],
    ] as const) {
      const result = toAnimationClip('c', [clip('child-node', kind, [0, 30], [5, 5], 1)], skeleton);
      const track = result.tracks.find(t => t.property === 'position')!;
      expect(track, `kind ${kind}`).toBeDefined();
      expect(track.values[component], `kind ${kind}`).toBe(5);
    }
    for (const [kind, component] of [
      [7, 1],
      [8, 2],
    ] as const) {
      const result = toAnimationClip(
        'c',
        [clip('child-node', kind, [0, 30], [0.5, 0.5], 1)],
        skeleton,
      );
      const track = result.tracks.find(t => t.property === 'quaternion')!;
      expect(track, `kind ${kind}`).toBeDefined();
      const moved = [0, 1, 2].map(i => Math.abs(track.values[i]) > 1e-6);
      expect(moved.indexOf(true), `kind ${kind}`).toBe(component);
    }
  });

  it('skips the channel kinds no model ships, 6 and 11-13, like any unknown kind', () => {
    for (const kind of [6, 11, 12, 13, 99]) {
      const result = toAnimationClip('c', [clip('child-node', kind, [0, 30], [5, 5], 1)], skeleton);
      expect(result.tracks, `kind ${kind}`).toEqual([]);
    }
  });

  it('reads kind 9 as an angle about the bind axis, not a quaternion W', () => {
    // Kind 9 carries an angle in radians; the axis comes from the bone's
    // stored bind rotation, which here is +Y.
    const result = toAnimationClip(
      'idle',
      [clip('root-node', ANGLE_ON_BIND_AXIS, [0, 30], [0, Math.PI], 1)],
      skeleton,
    );

    const track = result.tracks.find(t => t.property === 'quaternion')!;
    // At angle 0 the rotation is identity (after un-conjugating, w stays 1).
    expect(track.values[3]).toBeCloseTo(1, 5);
    // At angle pi it is a half turn about Y: w = cos(pi/2) = 0, |y| = 1.
    expect(Math.abs(track.values[4 + 1])).toBeCloseTo(1, 5);
    expect(track.values[4 + 3]).toBeCloseTo(0, 5);
  });

  it('keeps successive quaternion keys on the same hemisphere', () => {
    // q and -q are the same rotation, but interpolating between them goes the
    // long way round through a near-zero quaternion and snaps the bone.
    const result = toAnimationClip(
      'idle',
      [clip('root-node', TURN, [0, 30], [0, 0, 0, 1, 0, 0, 0, -1], 4)],
      skeleton,
    );

    const track = result.tracks.find(t => t.property === 'quaternion')!;
    const dot =
      track.values[0] * track.values[4] +
      track.values[1] * track.values[5] +
      track.values[2] * track.values[6] +
      track.values[3] * track.values[7];
    expect(dot).toBeGreaterThan(0);
  });

  it('emits only the properties a bone actually animates', () => {
    const result = toAnimationClip(
      'idle',
      [clip('root-node', SIZE, [0, 30], [1, 1, 1, 2, 2, 2], 3)],
      skeleton,
    );

    expect(result.tracks.map(t => t.property)).toEqual(['scale']);
    expect(result.tracks[0].bone).toBe('root-node');
  });

  it('ignores channels targeting a bone the model does not have', () => {
    const result = toAnimationClip(
      'idle',
      [clip('ghost-node', TURN, [0, 30], [0, 0, 0, 1, 0, 0, 0, 1], 4)],
      skeleton,
    );

    expect(result.tracks).toHaveLength(0);
  });

  it('holds the last key rather than easing back to the first', () => {
    const result = toAnimationClip(
      'idle',
      [
        clip('root-node', OFFSET, [0, 30], [0, 0, 0, 0, 4, 0], 3),
        clip('child-node', OFFSET, [0, 60], [0, 0, 0, 0, 8, 0], 3),
      ],
      skeleton,
    );

    // The root's curve is shorter than the clip; at its end it holds.
    const rootTrack = result.tracks.find(t => t.bone === 'root-node')!;
    expect(rootTrack.values[rootTrack.values.length - 2]).toBeCloseTo(4, 5);
    expect(result.duration).toBeCloseTo(2, 6);
  });
});

/**
 * Morph-weight channels.
 *
 * These are the flag and bunting clips. Two things make them unlike every
 * other channel: the target is a morph *controller*, which is nowhere in the
 * scene graph, and which of that controller's blend shapes the curve drives
 * lives in the channel's `member` rather than in the clip's order.
 */
describe('toNodeAnimation, morph weights', () => {
  const BLEND_WEIGHT = 14;
  const BINDINGS: MorphBindings = new Map([
    ['flag-mesh-morpher', { mesh: 'flag-mesh', targets: 5 }],
  ]);

  function weights(member: number | null, times: number[], values: number[]): WireClip {
    return {
      id: `flag-mesh-morpher-weights${member ?? ''}`,
      channels: [{ target: 'flag-mesh-morpher', type: BLEND_WEIGHT, member }],
      samplers: [
        {
          input: { components: 1, values: times },
          output: { components: 1, values },
        },
      ],
    };
  }

  it('binds the curve to the mesh the controller deforms, by member', () => {
    const clip = toNodeAnimation(
      [weights(0, [0, 30], [0, 0.8]), weights(4, [0, 30], [1, 0])],
      'model/flag.bdae',
      BINDINGS,
    );

    expect(clip).toBeTruthy();
    expect(clip!.tracks).toHaveLength(2);
    // The mesh, not the controller: a controller is not an object Three can
    // find, and a track bound to nothing costs a mixer update for no picture.
    expect(clip!.tracks.every(t => t.bone === 'flag-mesh')).toBe(true);
    expect(clip!.tracks.map(t => t.property)).toEqual(['morphInfluence', 'morphInfluence']);
    // Member, not clip order. `maincity_flag_03` ships five blend shapes and
    // four curves, for members 0, 1, 2 and 4 — taking them in order would
    // point the last curve at a pose the artist never animated.
    expect(clip!.tracks.map(t => t.morphIndex)).toEqual([0, 4]);
    expect(clip!.tracks[0].values[0]).toBe(0);
    expect(clip!.tracks[0].values[1]).toBeCloseTo(0.8, 6);
  });

  it('reads weight times as ticks, like every other curve', () => {
    const clip = toNodeAnimation([weights(0, [0, 60], [0, 1])], 'model/flag.bdae', BINDINGS);
    expect(Array.from(clip!.tracks[0].times)).toEqual([0, 2]);
    expect(clip!.duration).toBeCloseTo(2, 6);
  });

  it('drops a weight naming a controller the model does not have', () => {
    expect(toNodeAnimation([weights(0, [0, 30], [0, 1])], 'model/flag.bdae', new Map())).toBeNull();
    expect(toNodeAnimation([weights(0, [0, 30], [0, 1])], 'model/flag.bdae')).toBeNull();
  });

  it('drops a weight naming a blend shape past the end of the controller', () => {
    const one: MorphBindings = new Map([['flag-mesh-morpher', { mesh: 'flag-mesh', targets: 1 }]]);
    expect(toNodeAnimation([weights(3, [0, 30], [0, 1])], 'model/flag.bdae', one)).toBeNull();
    expect(toNodeAnimation([weights(0, [0, 30], [0, 1])], 'model/flag.bdae', one)).toBeTruthy();
  });

  it('leaves node channels alone', () => {
    // A node channel puts 0xff in the member byte, which reads back as null;
    // it must still become a plain transform track.
    const clip = toNodeAnimation(
      [
        {
          id: 'windmill-node-rotation',
          channels: [{ target: 'windmill-node', type: 5, member: null }],
          samplers: [
            {
              input: { components: 1, values: [0, 30] },
              output: { components: 4, values: [0, 0, 0, 1, 0, 1, 0, 0] },
            },
          ],
        },
      ],
      'model/windmill.bdae',
      BINDINGS,
    );

    expect(clip!.tracks).toHaveLength(1);
    expect(clip!.tracks[0]).toMatchObject({ bone: 'windmill-node', property: 'quaternion' });
    expect(clip!.tracks[0].morphIndex).toBeUndefined();
  });
});
