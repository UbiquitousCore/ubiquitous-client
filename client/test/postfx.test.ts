import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { PostEffects, needsPostEffects } from '../src/renderer/postfx/PostEffects';

/** Enough of a renderer for the passes to size their buffers; nothing draws. */
function stubRenderer(): THREE.WebGLRenderer {
  return {
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(64, 32),
    getSize: (v: THREE.Vector2) => v.set(64, 32),
    getPixelRatio: () => 1,
  } as unknown as THREE.WebGLRenderer;
}

function make(multisample: boolean): PostEffects {
  return new PostEffects(
    stubRenderer(),
    new THREE.Scene(),
    new THREE.Scene(),
    new THREE.PerspectiveCamera(),
    multisample,
  );
}

/** The composer's chain and targets, in order. */
function chainOf(post: PostEffects): {
  passes: unknown[];
  renderTarget1: THREE.WebGLRenderTarget;
  renderTarget2: THREE.WebGLRenderTarget;
} {
  return (
    post as unknown as {
      composer: {
        passes: unknown[];
        renderTarget1: THREE.WebGLRenderTarget;
        renderTarget2: THREE.WebGLRenderTarget;
      };
    }
  ).composer;
}

describe('the post effects', () => {
  it('needs the buffer only for tone mapping', () => {
    expect(needsPostEffects({ toneMapping: 'none' })).toBe(false);
    expect(needsPostEffects({ toneMapping: 'aces' })).toBe(true);
  });

  it('holds the values the canvas would, and copies them to the screen untouched', () => {
    const composer = chainOf(make(false));
    for (const target of [composer.renderTarget1, composer.renderTarget2]) {
      // Three gives a target's programs its texture's colour space only under this flag.
      expect((target as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget).toBe(true);
      expect(target.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    }
    // Sky, world, copy: nothing else rides the chain.
    expect(composer.passes).toHaveLength(3);
  });

  it('keeps half-float targets, multisampled only with the canvas', () => {
    const plain = chainOf(make(false));
    expect(plain.renderTarget1.texture.type).toBe(THREE.HalfFloatType);
    expect(plain.renderTarget1.samples).toBe(0);
    expect(chainOf(make(true)).renderTarget1.samples).toBe(4);
  });

  it('sizes once, so the per-frame call cannot realloc', () => {
    const post = make(false);
    post.setSize(64, 32, 1);
    const sized = chainOf(post).renderTarget1.width;
    post.setSize(64, 32, 1);
    expect(chainOf(post).renderTarget1.width).toBe(sized);
  });
});
