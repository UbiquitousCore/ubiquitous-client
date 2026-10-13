/**
 * Every hand-written shader must encode its output colour space; a raw
 * `ShaderMaterial` writes linear straight through and renders ~4x too dark.
 * Ground and water work in display values and are tested separately.
 */

import { describe, expect, it } from 'vitest';
import { createShadowMaterial } from '../src/renderer/ObjectShadows';
import { createRingMaterial } from '../src/renderer/TargetRing';

const SHADERS: Array<[string, string]> = [
  ['shadow', createShadowMaterial().fragmentShader],
  ['target ring', createRingMaterial().fragmentShader],
];

describe('shader output colour space', () => {
  for (const [name, source] of SHADERS) {
    it(`${name} encodes its output`, () => {
      expect(source).toContain('#include <colorspace_fragment>');
    });

    it(`${name} writes gl_FragColor before encoding it`, () => {
      // The chunk operates on gl_FragColor, so it has to come after the write.
      const write = source.lastIndexOf('gl_FragColor =');
      const encode = source.indexOf('#include <colorspace_fragment>');
      expect(write).toBeGreaterThanOrEqual(0);
      expect(encode).toBeGreaterThan(write);
    });
  }
});
