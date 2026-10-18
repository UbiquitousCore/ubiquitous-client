/**
 * The two lines of a nameplate, and the gap between them.
 *
 * The name and the role are ONE block laid out with a single font. Two things
 * follow: the advance from one line to the next is the font size and
 * nothing else — no extra leading — and both lines are drawn at the same
 * size, because there is only one font in use.
 *
 * The block is centred on the nameplate height: the layout shifts every line
 * up by half the total advance, so a two-line label ends up half a line
 * either side of the anchor.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  NAME_COLOURS,
  PLAYER_NAME_COLOUR,
  nameLabelLayout,
  namePlateHeight,
} from '../src/renderer/nameLabels';

describe('a nameplate with a role under it', () => {
  it('puts exactly one line between the name and the role', () => {
    const { centres, textPx } = nameLabelLayout(2);
    expect(centres).toHaveLength(2);
    expect(centres[1]! - centres[0]!).toBe(textPx);
  });

  it('draws the role at the same size as the name', () => {
    // One font for the whole billboard; a role a size down makes the pair
    // read as too far apart.
    const one = nameLabelLayout(1);
    const two = nameLabelLayout(2);
    expect(two.textPx).toBe(one.textPx);
  });

  it('straddles the anchor, half a line each side', () => {
    const { centres, height, textPx } = nameLabelLayout(2);
    expect(centres[0]!).toBe(height / 2 - textPx / 2);
    expect(centres[1]!).toBe(height / 2 + textPx / 2);
  });

  it('leaves room above and below for the glyphs and their shadow', () => {
    const { centres, height, textPx } = nameLabelLayout(2);
    // An ascender is roughly four fifths of the size, and the shadow adds a
    // few pixels under the last line.
    expect(centres[0]! - textPx * 0.8).toBeGreaterThan(0);
    expect(centres[1]! + textPx * 0.8).toBeLessThan(height);
  });
});

describe('a nameplate with only a name', () => {
  it('sits one line on the anchor, and is untouched by the pair’s spacing', () => {
    const { centres, height } = nameLabelLayout(1);
    expect(centres).toHaveLength(1);
    expect(Math.abs(centres[0]! - height / 2)).toBeLessThanOrEqual(2);
  });
});

describe('how high above a body the plate sits', () => {
  /** A body with a `Dummy_Name` node at the given world height. */
  function withAnchor(y: number): THREE.Object3D {
    const body = new THREE.Object3D();
    const anchor = new THREE.Object3D();
    anchor.name = 'Dummy_Name';
    anchor.position.set(0, y, 0);
    body.add(anchor);
    body.updateMatrixWorld(true);
    return body;
  }

  it('is where the model says, when the model says', () => {
    // The shipped models carry the anchor; measuring the mesh is the fallback.
    expect(namePlateHeight(withAnchor(2.4), 1.8)).toBeCloseTo(2.4, 5);
  });

  it('clears the measured top when the anchor sits lower, as on a wolf', () => {
    expect(namePlateHeight(withAnchor(0.8), 1)).toBeCloseTo(1.5, 5);
  });

  it('is measured from the body, not from the world', () => {
    const body = withAnchor(2.4);
    // Standing on a hill must not push the plate up with the terrain.
    body.position.set(0, 50, 0);
    body.updateMatrixWorld(true);

    expect(namePlateHeight(body, 1.8)).toBeCloseTo(2.4, 5);
  });

  it('clears the body when there is no anchor', () => {
    const bare = new THREE.Object3D();

    expect(namePlateHeight(bare, 1.8)).toBeCloseTo(2.3, 5);
  });

  it('falls back to a standing height for a body with no height either', () => {
    // An unbuilt body measures zero, and a plate at zero sits in the ground.
    expect(namePlateHeight(new THREE.Object3D(), 0)).toBe(1.8);
  });

  it(`ignores an anchor at or below the body’s own origin`, () => {
    // A model whose anchor failed to transform reads as zero or negative,
    // which would put the name under the feet.
    expect(namePlateHeight(withAnchor(0), 1.8)).toBeCloseTo(2.3, 5);
    expect(namePlateHeight(withAnchor(-1), 1.8)).toBeCloseTo(2.3, 5);
  });
});

describe('the colour of a name', () => {
  it('tells friend, foe, the undecided and the capturable apart', () => {
    const creatures = [
      NAME_COLOURS['ally'],
      NAME_COLOURS['enemy'],
      NAME_COLOURS['bystander'],
      NAME_COLOURS['catchable'],
    ];
    expect(new Set(creatures).size).toBe(creatures.length);
  });

  it('draws corpses and quest NPCs in the friendly colour', () => {
    expect(NAME_COLOURS['corpse']).toBe(NAME_COLOURS['ally']);
    expect(NAME_COLOURS['questUnit']).toBe(NAME_COLOURS['ally']);
  });

  it('never draws another player in a creature colour', () => {
    expect(Object.values(NAME_COLOURS)).not.toContain(PLAYER_NAME_COLOUR);
  });

  it('is a colour a canvas accepts', () => {
    for (const colour of [...Object.values(NAME_COLOURS), PLAYER_NAME_COLOUR]) {
      expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
