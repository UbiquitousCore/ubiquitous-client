/**
 * Adapting a program loaded from the build, and the values fed to one.
 *
 * Every program text here is a stand-in written for the test.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  LOADED_ENTRY,
  adaptProgram,
  adaptStage,
  forwardDepthColumns,
  readSceneFog,
} from '../src/renderer/packProgram';

const STAND_IN = [
  '#version 100',
  '#pragma STDGL invariant(all)',
  'attribute vec4 Corner;',
  '/* void main() { a commented-out entry point } */',
  '// void main() {}',
  'void main(void)',
  '{',
  '  gl_Position = Corner;',
  '}',
].join('\r\n');

describe('adaptStage', () => {
  it('renames the entry point and calls it from a new one that runs the extra statements', () => {
    const out = adaptStage(STAND_IN, { after: '  gl_Position.w = 1.0;' })!;
    expect(out).toContain(`void ${LOADED_ENTRY}()`);
    expect(out.match(/void main\(\)/g)).toHaveLength(1);
    const wrapper = out.slice(out.indexOf('void main()'));
    expect(wrapper.indexOf(`${LOADED_ENTRY}();`)).toBeLessThan(
      wrapper.indexOf('gl_Position.w = 1.0;'),
    );
  });

  it('drops comments, line feeds from another platform, and version and pragma lines', () => {
    const out = adaptStage(STAND_IN)!;
    expect(out).not.toContain('\r');
    expect(out).not.toContain('commented-out');
    expect(out).not.toContain('#version');
    expect(out).not.toContain('#pragma');
    expect(out.startsWith('precision highp float;')).toBe(true);
  });

  it('renames whole identifiers only', () => {
    const out = adaptStage(
      `attribute vec4 Corner;\nattribute vec4 CornerTwo;\nvoid main() { gl_Position = Corner + CornerTwo; }`,
      {
        rename: { Corner: 'position' },
      },
    )!;
    expect(out).toContain('attribute vec4 position;');
    expect(out).toContain('CornerTwo');
    expect(out).toContain('position + CornerTwo');
  });

  it('puts the prelude ahead of the loaded text', () => {
    const out = adaptStage(STAND_IN, { prelude: 'varying float vOurs;' })!;
    expect(out.indexOf('varying float vOurs;')).toBeLessThan(out.indexOf('attribute vec4 Corner;'));
  });

  it('refuses text with no entry point', () => {
    expect(adaptStage('uniform float nothing;')).toBeNull();
    expect(adaptStage('/* void main() {} */')).toBeNull();
  });
});

describe('adaptProgram', () => {
  it('needs both stages', () => {
    expect(adaptProgram({ vertex: STAND_IN, fragment: null }, {}, {})).toBeNull();
    expect(adaptProgram(null, {}, {})).toBeNull();
    expect(adaptProgram({ vertex: STAND_IN, fragment: STAND_IN }, {}, {})).not.toBeNull();
  });
});

describe('readSceneFog', () => {
  it('encodes the fog colour for display and passes the range through', () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(new THREE.Color(0.5, 0, 1), 20, 200);
    const colour = new THREE.Vector4();
    const range = new THREE.Vector2();
    readSceneFog(scene, colour, range);
    expect(colour.x).toBeCloseTo(0.735, 2);
    expect(colour.y).toBe(0);
    expect(colour.z).toBeCloseTo(1, 6);
    expect(colour.w).toBe(1);
    expect(range.toArray()).toEqual([20, 200]);
  });

  it('pushes fog out of reach when the scene has none', () => {
    const range = new THREE.Vector2();
    readSceneFog(new THREE.Scene(), new THREE.Vector3(), range);
    expect(range.x).toBeGreaterThan(1e6);
    expect(range.y).toBeGreaterThan(range.x);
  });
});

describe('forwardDepthColumns', () => {
  it('gives the distance in front of the camera from the third column', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    camera.updateMatrixWorld();
    const modelView = new THREE.Matrix4().multiplyMatrices(
      camera.matrixWorldInverse,
      new THREE.Matrix4(),
    );
    const out = forwardDepthColumns(modelView, new THREE.Matrix4());
    const e = out.elements;
    const column = new THREE.Vector4(e[8], e[9], e[10], e[11]);
    expect(column.dot(new THREE.Vector4(0, 0, 0, 1))).toBeCloseTo(10, 6);
    expect(column.dot(new THREE.Vector4(0, 0, 4, 1))).toBeCloseTo(6, 6);
  });
});
