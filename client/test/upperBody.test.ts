/**
 * Swinging while running: action tracks split at the spine so the two
 * halves write disjoint bones (three.js would average them). Also the body
 * measurement spells scale by, taken once so effects do not grow per cast.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { markNotBody, measureBody, splitClip, upperBodyBones } from '../src/renderer/upperBody';

/** The character skeleton as the build actually ships it, trimmed. */
function skeleton(): THREE.Object3D {
  const node = (name: string, ...children: THREE.Object3D[]): THREE.Object3D => {
    const o = new THREE.Object3D();
    o.name = name;
    for (const c of children) o.add(c);
    return o;
  };

  return node(
    'Bip01',
    node('Bip01_Footsteps'),
    node(
      'Bip01_Pelvis',
      node('Bip01_L_Thigh', node('Bip01_L_Calf', node('Bip01_L_Foot'))),
      node('Bip01_R_Thigh', node('Bip01_R_Calf', node('Bip01_R_Foot'))),
    ),
    node(
      'Bip01_Spine',
      node(
        'Bip01_Spine1',
        node('Bip01_Neck', node('Bip01_Head', node('Dummy_Head_Effect'))),
        node(
          'Bip01_L_Clavicle',
          node(
            'Bip01_L_UpperArm',
            node('Bip01_L_Forearm', node('Bip01_L_Hand', node('Dummy_L_Hand'))),
          ),
        ),
        node(
          'Bip01_R_Clavicle',
          node(
            'Bip01_R_UpperArm',
            node('Bip01_R_Forearm', node('Bip01_R_Hand', node('Dummy_R_Hand'))),
          ),
        ),
      ),
    ),
  );
}

/** A clip with one rotation track per bone named. */
function clipOver(names: string[]): THREE.AnimationClip {
  return new THREE.AnimationClip(
    'test',
    1,
    names.map(
      name =>
        new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ),
  );
}

const boneOf = (track: THREE.KeyframeTrack): string =>
  track.name.slice(0, track.name.lastIndexOf('.'));

describe('splitting a body in half', () => {
  it('puts the arms, head and weapon hands above the waist', () => {
    const upper = upperBodyBones(skeleton())!;
    expect(upper).not.toBeNull();

    // The half that has to keep holding a weapon while the legs run.
    for (const bone of [
      'Bip01_Spine',
      'Bip01_Spine1',
      'Bip01_Neck',
      'Bip01_Head',
      'Bip01_R_Hand',
      'Bip01_L_Hand',
      'Dummy_R_Hand',
      'Dummy_Head_Effect',
    ]) {
      expect(upper.has(bone)).toBe(true);
    }
    // The half that has to keep running while the arms swing. The pelvis and
    // the root carry the travel, so they belong to the legs.
    for (const bone of [
      'Bip01',
      'Bip01_Pelvis',
      'Bip01_L_Thigh',
      'Bip01_R_Foot',
      'Bip01_Footsteps',
    ]) {
      expect(upper.has(bone)).toBe(false);
    }
  });

  it('has no answer for a model that is not built that way', () => {
    // A creature. Null rather than an empty set: the caller falls back to
    // playing combat clips over the whole body, which is what creatures have.
    const wolf = new THREE.Object3D();
    wolf.name = 'wolf_root';
    expect(upperBodyBones(wolf)).toBeNull();
  });

  it('gives the two halves disjoint tracks that add back up to the whole', () => {
    const upper = upperBodyBones(skeleton())!;
    const whole = clipOver([
      'Bip01',
      'Bip01_Pelvis',
      'Bip01_L_Thigh',
      'Bip01_R_Thigh',
      'Bip01_Spine',
      'Bip01_R_Hand',
      'Bip01_Head',
    ]);

    const top = splitClip(whole, upper, 'upper');
    const bottom = splitClip(whole, upper, 'lower');

    expect(top.tracks.map(boneOf).sort()).toEqual(['Bip01_Head', 'Bip01_R_Hand', 'Bip01_Spine']);
    expect(bottom.tracks.map(boneOf).sort()).toEqual([
      'Bip01',
      'Bip01_L_Thigh',
      'Bip01_Pelvis',
      'Bip01_R_Thigh',
    ]);

    // Disjoint is the whole point: a bone written by both would be blended to
    // the average of the two poses rather than taking the combat one.
    const overlap = top.tracks.map(boneOf).filter(b => bottom.tracks.map(boneOf).includes(b));
    expect(overlap).toEqual([]);
    expect(top.tracks.length + bottom.tracks.length).toBe(whole.tracks.length);
    // The halves run for as long as the whole, or they would drift apart.
    expect(top.duration).toBe(whole.duration);
    expect(bottom.duration).toBe(whole.duration);
  });

  it('yields an empty upper half for a clip that only moves the legs', () => {
    const upper = upperBodyBones(skeleton())!;
    const legsOnly = clipOver(['Bip01', 'Bip01_L_Thigh']);
    // The caller checks for this and falls back to a whole-body clip: an
    // overlay with no tracks in it would simply do nothing.
    expect(splitClip(legsOnly, upper, 'upper').tracks).toHaveLength(0);
  });
});

describe('measuring a body', () => {
  /** A body one unit wide and two tall, standing at y = 10. */
  function body(): THREE.Object3D {
    const root = new THREE.Object3D();
    root.position.set(5, 10, -3);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
    mesh.position.y = 1; // feet on the ground
    root.add(mesh);
    root.updateMatrixWorld(true);
    return root;
  }

  it('measures the body and not the sprites floating over it', () => {
    const root = body();
    const nameplate = new THREE.Sprite();
    nameplate.position.y = 4;
    nameplate.scale.setScalar(2);
    root.add(nameplate);
    root.updateMatrixWorld(true);

    const measured = measureBody(root)!;
    // Two units tall, as authored — not four and a bit, which is where the
    // nameplate floats.
    expect(measured.size.y).toBeCloseTo(2, 5);
    expect(measured.centreOffsetY).toBeCloseTo(1, 5);
  });

  it('is unmoved by an effect attached to it afterwards', () => {
    const root = body();
    const before = measureBody(root)!;

    // A spell effect hangs off a bone inside the body. Measured live, this
    // would make every subsequent cast bigger than the last.
    const effect = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30));
    root.add(effect);
    root.updateMatrixWorld(true);

    // The cached measurement is the one the caller keeps, and it is the body.
    expect(before.size.y).toBeCloseTo(2, 5);
    // Measuring again now would give the effect's size, which is the bug.
    expect(measureBody(root)!.size.y).toBeGreaterThan(20);
  });

  it('reports an offset that survives the body walking away', () => {
    const root = body();
    const measured = measureBody(root)!;
    // Relative to the body's own origin, so the caller adds the current
    // position back rather than re-measuring every frame.
    expect(measured.centreOffsetY).toBeCloseTo(1, 5);
    expect(10 + measured.centreOffsetY).toBeCloseTo(11, 5);
  });

  it('has nothing to say about a body with no geometry', () => {
    const empty = new THREE.Object3D();
    expect(measureBody(empty)).toBeUndefined();
  });
});

describe('what counts as the body', () => {
  /*
   * Spell effects scale by this measurement; only the character model's box
   * counts, so an upright polearm does not double the character's height.
   */
  function body(height: number): THREE.Object3D {
    const root = new THREE.Object3D();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, 0.4));
    mesh.position.y = height / 2;
    root.add(mesh);
    root.updateMatrixWorld(true);
    return root;
  }

  it('measures the body itself', () => {
    expect(measureBody(body(2))!.size.y).toBeCloseTo(2, 5);
  });

  it('ignores a weapon held above the head', () => {
    const root = body(2);
    const polearm = new THREE.Object3D();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 0.1));
    blade.position.y = 3;
    polearm.add(blade);
    markNotBody(polearm);
    root.add(polearm);
    root.updateMatrixWorld(true);

    // Counted, this reads as 4 m, well up the effect scale.
    expect(measureBody(root)!.size.y).toBeCloseTo(2, 5);
  });

  it('prunes the whole marked subtree, however deep the geometry sits', () => {
    const root = body(2);
    const held = new THREE.Object3D();
    markNotBody(held);
    const nested = new THREE.Object3D();
    const glow = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6));
    glow.position.y = 5;
    nested.add(glow);
    held.add(nested);
    root.add(held);
    root.updateMatrixWorld(true);

    expect(measureBody(root)!.size.y).toBeCloseTo(2, 5);
  });

  it('still measures the root even though it is where the marking starts', () => {
    // The root is the body: marking must never be read off it and prune
    // everything.
    const root = body(2);
    markNotBody(root);
    root.updateMatrixWorld(true);
    expect(measureBody(root)!.size.y).toBeCloseTo(2, 5);
  });
});
