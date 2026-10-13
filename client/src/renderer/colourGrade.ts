/**
 * The final colour grade on each display value: brightness, then contrast
 * about the middle, then saturation, each clamped to 0..1, as a CSS filter of
 * the same three numbers works. Applied by each program as it writes its
 * display values: three's own at their output conversion, ours at the end of
 * `main` (`withGrade`). The post effects' buffer holds those same values, so
 * the picture is the same with them on or off.
 */

import * as THREE from 'three';

/** Own choice, set by the owner by eye beside the game with the admin panel's sliders. */
export const GRADE_BRIGHTNESS = 1.16;
/** Own choice, set by the owner by eye beside the game with the admin panel's sliders. */
export const GRADE_CONTRAST = 1.04;
/** Own choice, set by the owner by eye beside the game with the admin panel's sliders. */
export const GRADE_SATURATION = 1.03;

/** The grade as a GLSL statement on `gl_FragColor.rgb`, in display values. */
export const GRADE_GLSL = /* glsl */ `
  {
    vec3 graded = clamp( gl_FragColor.rgb * ${GRADE_BRIGHTNESS.toFixed(3)}, 0.0, 1.0 );
    graded = clamp( ( graded - 0.5 ) * ${GRADE_CONTRAST.toFixed(3)} + 0.5, 0.0, 1.0 );
    float gradeLuma = dot( graded, vec3( 0.213, 0.715, 0.072 ) );
    gl_FragColor.rgb = clamp( mix( vec3( gradeLuma ), graded, ${GRADE_SATURATION.toFixed(3)} ), 0.0, 1.0 );
  }
`;

/** Three's output conversion, as it ships. */
const STOCK_OUTPUT = THREE.ShaderChunk.colorspace_fragment;

/** Grade three's programs at their output conversion, where it is not the identity; applies to every later program. */
export function installColourGrade(): void {
  if (THREE.ShaderChunk.colorspace_fragment !== STOCK_OUTPUT) return;
  THREE.ShaderChunk.colorspace_fragment = /* glsl */ `
${STOCK_OUTPUT}
if ( linearToOutputTexel( vec4( 0.5 ) ).r > 0.6 ) ${GRADE_GLSL}
`;
}

/** Grade at the end of a fragment program of our own, whose `main` is the last function in it. */
export function withGrade(fragment: string): string {
  const close = fragment.lastIndexOf('}');
  if (close < 0 || fragment.search(/\bvoid\s+main\s*\(/) < 0) return fragment;
  return fragment.slice(0, close) + GRADE_GLSL + fragment.slice(close);
}
