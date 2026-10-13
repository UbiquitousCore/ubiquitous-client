/** GPU programs whose text comes from the mounted build, never copied; materials start on their own and switch. */

import * as THREE from 'three';

/** The two entry names of one program in the build's resource pack. */
export interface ProgramNames {
  readonly vertex: string;
  readonly fragment: string;
}

/** One program's two stages, adapted and ready to hand to a material. */
export interface ProgramText {
  readonly vertex: string;
  readonly fragment: string;
}

/** What the loaded text's own entry point is renamed to, so a wrapper can call it. */
export const LOADED_ENTRY = 'loadedProgramMain';

const ENTRY = /\bvoid\s+main\s*\(\s*(?:void\s*)?\)/;

export interface StageWrap {
  /** Whole-word identifier renames, applied to the loaded text only. */
  readonly rename?: Readonly<Record<string, string>>;
  /** Declarations placed ahead of the loaded text. */
  readonly prelude?: string;
  /** Statements run after the loaded entry point, inside the new `main`. */
  readonly after?: string;
}

/**
 * Adapt a loaded stage: normalise line endings, drop comments (a commented
 * `main` must not match), strip `#version` and `#pragma`, add float
 * precision, and rename `main` so a new one can run `after`. Null without a `main`.
 */
export function adaptStage(text: string, wrap: StageWrap = {}): string | null {
  let body = text
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .split('\n')
    .filter(line => !/^\s*#\s*(?:version|pragma)\b/.test(line))
    .join('\n');
  if (!ENTRY.test(body)) return null;
  for (const [from, to] of Object.entries(wrap.rename ?? {})) {
    body = body.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  body = body.replace(ENTRY, `void ${LOADED_ENTRY}()`);
  return [
    'precision highp float;',
    wrap.prelude ?? '',
    body,
    'void main() {',
    `  ${LOADED_ENTRY}();`,
    wrap.after ?? '',
    '}',
    '',
  ].join('\n');
}

/**
 * Adapt both stages, or null when either will not wrap.
 *
 * Half a program is no program: a material only switches when both stages
 * are usable.
 */
export function adaptProgram(
  source: { vertex: string | null; fragment: string | null } | null,
  vertexWrap: StageWrap,
  fragmentWrap: StageWrap,
): ProgramText | null {
  if (!source?.vertex || !source.fragment) return null;
  const vertex = adaptStage(source.vertex, vertexWrap);
  const fragment = adaptStage(source.fragment, fragmentWrap);
  return vertex && fragment ? { vertex, fragment } : null;
}

/** Far enough that a program's linear fog never starts. */
const NO_FOG: readonly [number, number] = [1e7, 1e7 + 1];

/** Scene fog in display space: the loaded programs work in display values; the scene holds linear. */
export function readSceneFog(
  scene: THREE.Scene | null,
  colour: THREE.Vector4 | THREE.Vector3,
  range: THREE.Vector2,
): void {
  const fog = scene?.fog;
  if (fog && (fog as THREE.Fog).isFog) {
    const linear = fog as THREE.Fog;
    const rgb = linear.color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    colour.x = rgb.r;
    colour.y = rgb.g;
    colour.z = rgb.b;
    if (colour instanceof THREE.Vector4) colour.w = 1;
    range.set(linear.near, Math.max(linear.far, linear.near + 1e-3));
    return;
  }
  range.set(NO_FOG[0], NO_FOG[1]);
}

const FLIP_Z = new THREE.Matrix4().makeScale(1, 1, -1);

/** Columns giving camera-forward depth from a model-space position; view space looks down -z. */
export function forwardDepthColumns(modelView: THREE.Matrix4, out: THREE.Matrix4): THREE.Matrix4 {
  return out.multiplyMatrices(FLIP_Z, modelView).transpose();
}
