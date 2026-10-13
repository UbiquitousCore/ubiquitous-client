/** How a surface composites, and what is not worth drawing at all. */

import type { MeshGroup } from '../types';

/**
 * What a material says about how it draws.
 *
 * Structurally what `Bdae.materialsByName()` hands back, spelled out here so
 * this file stays free of the format reader's types.
 */
export interface MaterialSurface {
  /** The shader `.bdae` the material's effect lives in, or `''`. */
  file: string;
  /** The effect URL fragment: `#unlit_textured_solid-fx`, `#ProfileCOMMON…`. */
  shader: string;
  /** The material binds a `<transparent>` texture. */
  transparent: boolean;
}

/** A material with nothing bound — the fallback when a group names none. */
export const NO_MATERIAL: MaterialSurface = { file: '', shader: '', transparent: false };

/**
 * The prefix the exporter gives an effect it generated from a
 * `<profile_COMMON>`, rather than one the artist wrote a shader for.
 */
const PROFILE_COMMON = '#profilecommon';

/** How a material's surface composites: named-shader family vs generated
 * `ProfileCOMMON`. Unrecognised names draw opaque (visible-but-wrong beats
 * vanished). `ProfileCOMMON` is unlit; a bound `<transparent>` texture blends
 * src-alpha over one-minus-src-alpha with depth writes off, else opaque.
 */
export function toSurface(
  material: MaterialSurface,
): Pick<MeshGroup, 'blend' | 'doubleSided' | 'unlit' | 'shader'> {
  const name = material.file.toLowerCase();

  if (!name && material.shader.toLowerCase().startsWith(PROFILE_COMMON)) {
    return {
      blend: material.transparent ? 'blend' : 'opaque',
      // Face culling would come from the COLLADA profile, which the material
      // record does not carry, so these surfaces draw one-sided.
      doubleSided: false,
      unlit: true,
      shader: 'profilecommon',
    };
  }

  const blend: MeshGroup['blend'] = name.includes('additive')
    ? 'additive'
    : name.includes('blend')
      ? 'blend'
      : name.includes('trans')
        ? 'cutout'
        : 'opaque';
  return {
    blend,
    // 2sides/trans_solid are open shells (hair/ears/cards) — no backface cull.
    doubleSided: name.includes('2sides') || name.includes('trans_solid'),
    // Nearly every material is unlit_*: the art is pre-lit.
    unlit: name.startsWith('unlit'),
    // `waterfall.bdae` -> `waterfall`. The renderer keys its animated
    // materials on this, so the extension must go.
    shader: name.replace(/\.bdae$/, ''),
  };
}

/**
 * A light shaft, drawn additive: picked out by mesh name (`light`, `lightNN`)
 * or a `sunshine` texture, since its material is the ordinary blend; its
 * vertex colour darkening only reads right when added.
 */
export function isLightShaft(meshName: string, texture: string | null): boolean {
  return /^light\d*(-mesh)?$/i.test(meshName) || /sunshine[^/]*$/i.test(texture ?? '');
}

/** `texture/phy_alpha.tga` is a fully transparent collision proxy; drawing it made black slabs. */
export function isPhyAlphaProxy(texture: string): boolean {
  return texture.toLowerCase().endsWith('phy_alpha.tga');
}

/** A `.beff` placed in a tile's records; not a model. */
export function isEffect(path: string): boolean {
  return (path || '').toLowerCase().endsWith('.beff');
}

/**
 * `phy.bdae` is a collision placeholder that ships alongside the art; drawing
 * it puts a grey box in the middle of the scene.
 */
export function isDrawableModel(path: string): boolean {
  const lower = (path || '').toLowerCase();
  return lower.endsWith('.bdae') && !lower.split('/').pop()!.startsWith('phy.bdae');
}
