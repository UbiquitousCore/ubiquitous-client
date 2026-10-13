/**
 * Where each body part paints on the shared skin sheet.
 *
 * The regions come from the character's own meshes: every patch of the sheet
 * is worn somewhere on the figure, and the bones that move it say where.
 * These tests build small synthetic meshes with known UV patches and check
 * the regions that come back.
 */

import { describe, expect, it } from 'vitest';

import {
  type SheetMesh,
  bareScalpStyles,
  footprints,
  regionRect,
  segmentOfBone,
} from '../src/assets/formats/avatarSheet';

/** One mesh made of axis-aligned UV quads, each wholly owned by one bone. */
function quads(patches: Array<{ bone: string; box: [number, number, number, number] }>): SheetMesh {
  const uvs: number[] = [];
  const indices: number[] = [];
  const bones = [...new Set(patches.map(p => p.bone))];
  const influences: SheetMesh['influences'] = [];
  for (const { bone, box } of patches) {
    const [u0, v0, u1, v1] = box.map(x => x / 128);
    const base = uvs.length / 2;
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    for (let i = 0; i < 4; i++) influences.push({ indices: [bones.indexOf(bone)], weights: [1] });
  }
  return { uvs, indices, ranges: [{ start: 0, count: indices.length }], bones, influences };
}

const px = (b: { u0: number; v0: number; u1: number; v1: number } | undefined) =>
  b && [b.u0, b.v0, b.u1, b.v1].map(x => Math.round(x * 128));

describe('segmentOfBone', () => {
  it('sorts a biped skeleton into the parts clothing covers', () => {
    expect(segmentOfBone('Bip01_Head')).toBe('head');
    expect(segmentOfBone('Bip01_L_Forearm')).toBe('forearm');
    expect(segmentOfBone('Bip01_R_Hand')).toBe('hand');
    expect(segmentOfBone('Bip01_L_Finger0')).toBe('hand');
    expect(segmentOfBone('Bip01_R_Thigh')).toBe('thigh');
    expect(segmentOfBone('Bip01_L_Calf')).toBe('shin');
    expect(segmentOfBone('Bip01_L_Foot')).toBe('foot');
    expect(segmentOfBone('Bip01_R_Toe0')).toBe('foot');
  });

  it('paints the neck, spine, pelvis and upper arms with the chest', () => {
    // The strip at the base of the skull is worn under a collar, not a helm.
    for (const bone of [
      'Bip01_Neck',
      'Bip01_Spine1',
      'Bip01_Pelvis',
      'Bip01_L_UpperArm',
      'Bone01',
    ]) {
      expect(segmentOfBone(bone)).toBe('torso');
    }
  });
});

describe('footprints', () => {
  it('bounds each segment by the UV patches its bones carry', () => {
    const mesh = quads([
      { bone: 'Bip01_Head', box: [3, 84, 60, 126] },
      { bone: 'Bip01_L_Hand', box: [4, 66, 58, 82] },
      { bone: 'Bip01_Spine', box: [66, 2, 125, 44] },
      { bone: 'Bip01_L_UpperArm', box: [2, 2, 62, 30] },
    ]);
    const f = footprints([mesh]);
    expect(px(f.head)).toEqual([3, 84, 60, 126]);
    expect(px(f.hand)).toEqual([4, 66, 58, 82]);
    expect(px(f.torso)).toEqual([2, 2, 125, 44]);
    expect(f.foot).toBeUndefined();
  });

  it('joins the patches of every mesh that wears the sheet', () => {
    const body = quads([{ bone: 'Bip01_L_Foot', box: [67, 110, 124, 126] }]);
    const shin = quads([{ bone: 'Bip01_L_Calf', box: [67, 84, 124, 110] }]);
    const f = footprints([body, shin]);
    expect(px(f.foot)).toEqual([67, 110, 124, 126]);
    expect(px(f.shin)).toEqual([67, 84, 124, 110]);
  });

  it('gives a patch to the bone that carries most of its weight', () => {
    const mesh = quads([{ bone: 'Bip01_Head', box: [3, 84, 60, 126] }]);
    // Blend every vertex 70/30 towards the neck: still a head patch.
    mesh.bones.push('Bip01_Neck');
    mesh.influences = mesh.influences.map(() => ({ indices: [0, 1], weights: [0.7, 0.3] }));
    expect(px(footprints([mesh]).head)).toEqual([3, 84, 60, 126]);
  });

  it('ignores a sliver far smaller than the rest of its segment', () => {
    // A few triangles at the top of the sheet weighted to the head would
    // otherwise stretch the head region over the whole chest.
    const mesh = quads([
      { bone: 'Bip01_Head', box: [3, 84, 60, 126] },
      { bone: 'Bip01_Head', box: [110, 0, 124, 3] },
    ]);
    expect(px(footprints([mesh]).head)).toEqual([3, 84, 60, 126]);
  });

  it('reads only the index ranges drawn with the sheet', () => {
    const mesh = quads([
      { bone: 'Bip01_Head', box: [3, 84, 60, 126] },
      { bone: 'Bip01_L_Hand', box: [4, 66, 58, 82] },
    ]);
    mesh.ranges = [{ start: 0, count: 6 }];
    const f = footprints([mesh]);
    expect(f.head).toBeDefined();
    expect(f.hand).toBeUndefined();
  });
});

describe('regionRect', () => {
  const box = (u0: number, v0: number, u1: number, v1: number) => ({
    u0: u0 / 128,
    v0: v0 / 128,
    u1: u1 / 128,
    v1: v1 / 128,
  });

  it('widens a footprint to the half of the sheet it sits in', () => {
    expect(regionRect([box(3, 84, 60, 126)], 128, 128)).toEqual([0, 84, 64, 128]);
    expect(regionRect([box(67, 84, 124, 110)], 128, 128)).toEqual([64, 84, 128, 110]);
    expect(regionRect([box(2, 1, 125, 44)], 128, 128)).toEqual([0, 0, 128, 44]);
  });

  it('rounds edges to whole texels and pulls one near the border onto it', () => {
    expect(regionRect([box(2, 30, 60, 80.6)], 128, 128)).toEqual([0, 30, 64, 81]);
    expect(regionRect([box(67, 84, 124, 126.7)], 128, 128)).toEqual([64, 84, 128, 128]);
    expect(regionRect([box(2, 1.4, 125, 44)], 128, 128)).toEqual([0, 0, 128, 44]);
  });

  it('unites several footprints', () => {
    expect(regionRect([box(2, 1, 125, 44), box(67, 44, 124, 110)], 128, 128)).toEqual([
      0, 0, 128, 110,
    ]);
  });

  it('lets lower-body art climb over the hips', () => {
    // A sixth of the legs' own height above the top of the leg meshes, so a
    // belt painted near the top of the art lands on the waist.
    expect(regionRect([box(67, 44, 124, 110)], 128, 128, true)).toEqual([64, 33, 128, 110]);
    expect(regionRect([box(67, 44, 124, 110)], 256, 256, true)).toEqual([128, 66, 256, 220]);
  });

  it('scales with the sheet it is drawn on', () => {
    expect(regionRect([box(3, 84, 60, 126)], 256, 256)).toEqual([0, 168, 128, 256]);
  });

  it('has nothing to give when no footprint is known', () => {
    expect(regionRect([undefined], 128, 128)).toBeNull();
  });
});

describe('bareScalpStyles', () => {
  const mesh = (name: string, ...groups: Array<[string, number]>) => ({
    name,
    groups: groups.map(([material, count]) => ({ material, count })),
  });

  it('calls a hair style bare when its mesh draws only the skin sheet', () => {
    const bare = bareScalpStyles([
      mesh('hair_01-mesh', ['body', 84]),
      mesh('hair_02-mesh', ['hair_b', 270], ['body', 84]),
      mesh('body-mesh', ['body', 3000]),
    ]);
    expect([...bare]).toEqual([1]);
  });

  it('calls a stray triangle of hair no hair at all', () => {
    const bare = bareScalpStyles([
      mesh('hair_00-mesh', ['hair_b', 3]),
      mesh('hair_03-mesh', ['hair_b', 120]),
    ]);
    expect([...bare]).toEqual([0]);
  });

  it('knows nothing of meshes outside the hair family', () => {
    expect(
      bareScalpStyles([mesh('ear_01-mesh', ['body', 30]), mesh('cape_01-mesh', ['cape', 0])]).size,
    ).toBe(0);
  });
});
