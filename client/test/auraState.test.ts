/**
 * How an aura shows on a body. Two mechanisms.
 *
 * An aura's own spell visual id hangs a persistent effect on the body, and
 * `CombatVisuals.addAura` does that. An aura whose row carries a spell
 * visual id of 0 hangs nothing, and that is correct.
 *
 * The ongoing *state* comes from somewhere else: the server reports it as a
 * unit value, and a stealthed body is drawn translucent.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { clearGhostAlpha, setGhostAlpha } from '../src/renderer/fadeMaterial';
import { isGhosted, speedShare, stealthSight } from '../src/gameplay/auraState';
import { FIELD_IDS } from '../src/net/unitFields';
import { GHOST_ALPHA, GHOST_FADE_SECONDS, stepGhost } from '../src/renderer/Renderer';

describe('which states fade a body', () => {
  it('reads stealth under the name the server sends', () => {
    expect(FIELD_IDS.stealthed).toBe('stealthed');
  });

  it('fades one the server reports stealthed', () => {
    expect(isGhosted({ stealthed: 1 })).toBe(true);
  });

  it('brings one back once the server reports it no longer stealthed', () => {
    expect(isGhosted({ stealthed: 0 })).toBe(false);
  });

  it('leaves a body alone when the batch says nothing about stealth', () => {
    // Slow, stun, chill, speed-up and silence ride the same batch, and none
    // of them changes how a body is drawn.
    expect(isGhosted({ slowed: 1, stunned: 1, health: 40 })).toBeUndefined();
  });

  it('still fades one that is stealthed and slowed at once', () => {
    expect(isGhosted({ stealthed: 1, slowed: 1 })).toBe(true);
  });
});

describe('how fast the server lets the player move', () => {
  it('reads the speed under the name the server sends', () => {
    expect(FIELD_IDS.moveSpeed).toBe('moveSpeed');
  });

  it('turns the percent the server sends into a share of normal speed', () => {
    expect(speedShare({ moveSpeed: 50 })).toBe(0.5);
    expect(speedShare({ moveSpeed: 200 })).toBe(2);
    expect(speedShare({ moveSpeed: 0 })).toBe(0);
    expect(speedShare({ moveSpeed: 100 })).toBe(1);
  });

  it('leaves the speed alone when the batch says nothing about it', () => {
    // The slowed flag alone carries no amount.
    expect(speedShare({ slowed: 1, health: 40 })).toBeUndefined();
  });
});

describe('the stealth alpha', () => {
  it('leaves a stealthed body faint but never quite gone', () => {
    expect(GHOST_ALPHA).toBeGreaterThan(0);
    expect(GHOST_ALPHA).toBeLessThan(0.25);
  });

  it('reaches the target within one fade time', () => {
    expect(stepGhost(1, GHOST_ALPHA, GHOST_FADE_SECONDS)).toBe(GHOST_ALPHA);
    expect(stepGhost(GHOST_ALPHA, 1, GHOST_FADE_SECONDS)).toBe(1);
  });

  it('moves partway in a partial frame, in both directions', () => {
    const down = stepGhost(1, GHOST_ALPHA, GHOST_FADE_SECONDS / 4);
    expect(down).toBeLessThan(1);
    expect(down).toBeGreaterThan(GHOST_ALPHA);

    const up = stepGhost(GHOST_ALPHA, 1, GHOST_FADE_SECONDS / 4);
    expect(up).toBeGreaterThan(GHOST_ALPHA);
    expect(up).toBeLessThan(1);
  });

  it('never overshoots, however long the frame took', () => {
    expect(stepGhost(1, GHOST_ALPHA, 30)).toBe(GHOST_ALPHA);
    expect(stepGhost(GHOST_ALPHA, 1, 30)).toBe(1);
  });
});

describe('what a ghosted body draws with', () => {
  it('turns an opaque material translucent, and rebuilds its program once', () => {
    const material = new THREE.MeshStandardMaterial();
    expect(material.transparent).toBe(false);
    const before = material.version;

    setGhostAlpha(material, GHOST_ALPHA);

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(GHOST_ALPHA);
    // Off, or the near half of a body punches holes in its own far half.
    expect(material.depthWrite).toBe(false);
    // Flipping `transparent` is what needs the shader program rebuilt;
    // without that the material stays drawn solid and the whole effect is
    // invisible. `needsUpdate` is write-only, so the bump it makes to
    // `version` is what can be seen.
    expect(material.version).toBeGreaterThan(before);

    // And not again on every frame of the fade.
    const settled = material.version;
    setGhostAlpha(material, GHOST_ALPHA / 2);
    expect(material.version).toBe(settled);
  });

  it('restores what the shared material it was cloned from had', () => {
    const shared = new THREE.MeshStandardMaterial();
    const own = shared.clone();

    setGhostAlpha(own, GHOST_ALPHA);
    clearGhostAlpha(own, shared);

    expect(own.transparent).toBe(false);
    expect(own.opacity).toBe(1);
    expect(own.depthWrite).toBe(true);
  });

  it('leaves a material that was always transparent transparent', () => {
    // A leaf card or a glass pane: restoring to "opaque" would be wrong, so
    // the original is what is restored from rather than an assumed default.
    const shared = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 });
    const own = shared.clone();

    setGhostAlpha(own, GHOST_ALPHA);
    clearGhostAlpha(own, shared);

    expect(own.transparent).toBe(true);
    expect(own.opacity).toBe(0.5);
  });
});

describe('who sees a stealthed body', () => {
  it('fades it for the hero and their team', () => {
    expect(stealthSight(true, true)).toBe('faded');
  });

  it('keeps it off the screen of everyone else, who cannot select it either', () => {
    expect(stealthSight(true, false)).toBe('hidden');
  });

  it('shows a body that is not stealthed to everyone', () => {
    expect(stealthSight(false, false)).toBe('shown');
    expect(stealthSight(undefined, false)).toBe('shown');
  });
});
