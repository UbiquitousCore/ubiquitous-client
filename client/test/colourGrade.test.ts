import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  GRADE_BRIGHTNESS,
  GRADE_CONTRAST,
  GRADE_GLSL,
  GRADE_SATURATION,
  installColourGrade,
  withGrade,
} from '../src/renderer/colourGrade';

describe('the picture’s grade', () => {
  it('is brightness, then contrast about the middle, then saturation', () => {
    const at = (n: number) => GRADE_GLSL.indexOf(n.toFixed(3));
    expect(at(GRADE_BRIGHTNESS)).toBeGreaterThan(0);
    expect(at(GRADE_CONTRAST)).toBeGreaterThan(at(GRADE_BRIGHTNESS));
    expect(at(GRADE_SATURATION)).toBeGreaterThan(at(GRADE_CONTRAST));
  });

  it('grades three’s own programs once, where they write to the screen', () => {
    installColourGrade();
    const once = THREE.ShaderChunk.colorspace_fragment;
    installColourGrade();
    expect(THREE.ShaderChunk.colorspace_fragment).toBe(once);
    expect(once).toContain('linearToOutputTexel( gl_FragColor )');
    // Only where the conversion is to display values, which the post
    // effects' buffer is given too: not into three's other buffers.
    expect(once).toMatch(
      /if \( linearToOutputTexel\( vec4\( 0\.5 \) \)\.r > 0\.6 \)[\s\S]*gradeLuma/,
    );
  });

  it('grades our own programs as the last thing main does', () => {
    const out = withGrade('uniform float x;\nvoid main() {\n  gl_FragColor = vec4(x);\n}\n');
    expect(out.indexOf('gradeLuma')).toBeGreaterThan(out.indexOf('gl_FragColor = vec4(x)'));
    expect(out.trimEnd().endsWith('}')).toBe(true);
  });
});
