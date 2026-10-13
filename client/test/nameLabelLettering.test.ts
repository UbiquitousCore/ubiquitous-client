/**
 * The typeface a name over a head is drawn in, and drawing it again.
 *
 * A label is rasterised into a canvas once. A canvas has no idea a
 * typeface arrived after it was drawn, so a label drawn in the fallback
 * stays in it until it is drawn again. The canvas is stood in for by one
 * that records what it was asked to draw.
 */

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BODY_FAMILY, canvasFont } from '../src/core/lettering';
import { NAME_LABEL_PX, redrawNameLabel, unitNameLabel } from '../src/renderer/nameLabels';

interface Drawn {
  font: string;
  text: string;
}

let drawn: Drawn[];

/** A canvas whose context records every line it fills, in the font it was set to. */
function recordingCanvas(): unknown {
  const context = {
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '',
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText(text: string) {
      drawn.push({ font: context.font, text });
    },
  };
  const canvas = {
    width: 300,
    height: 150,
    getContext: () => context,
  };
  // Resizing a real canvas resets its state, font included; so does this.
  return new Proxy(canvas, {
    set(target, key, value) {
      if (key === 'width' || key === 'height') context.font = '10px sans-serif';
      (target as Record<string | symbol, unknown>)[key] = value;
      return true;
    },
  });
}

beforeEach(() => {
  drawn = [];
  vi.stubGlobal('document', { createElement: () => recordingCanvas() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the name over a head', () => {
  it('is drawn in the interface’s body face', () => {
    unitNameLabel('Someone', 'Their Role', '#ffffff', 2);
    expect(drawn.map(line => line.text)).toEqual(['Someone', '- Their Role -']);
    for (const line of drawn) {
      expect(line.font).toBe(canvasFont(NAME_LABEL_PX));
      expect(line.font).toContain(`'${BODY_FAMILY}'`);
    }
  });

  it('is drawn again, the same words in a fresh texture, when asked', () => {
    const sprite = unitNameLabel('Someone', undefined, '#ffffff', 2);
    const material = sprite.material as THREE.SpriteMaterial;
    const before = material.map!;
    const disposed = vi.fn();
    before.addEventListener('dispose', disposed);
    const place = sprite.position.clone();
    drawn = [];

    redrawNameLabel(sprite);

    expect(drawn).toEqual([{ font: canvasFont(NAME_LABEL_PX), text: 'Someone' }]);
    expect(material.map).not.toBe(before);
    expect(disposed).toHaveBeenCalledOnce();
    expect(sprite.position.equals(place)).toBe(true);
  });

  it('leaves a sprite it did not draw alone', () => {
    const stranger = new THREE.Sprite(new THREE.SpriteMaterial());
    redrawNameLabel(stranger);
    expect(drawn).toEqual([]);
  });
});
