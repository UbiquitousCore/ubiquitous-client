/**
 * Weapon sounds by pack family (edge, blunt, dagger, fist, parry, arrow,
 * wand), each with swoosh, impact, critical and block. Which weapon takes
 * which family is own choice, by `assets/heldKinds.ts` sub-classes.
 */

export type WeaponFamily = 'edge' | 'blunt' | 'dagger' | 'fist' | 'parry' | 'arrow' | 'wand';

const CLASS_WEAPON = 2;

/** Weapon sub-classes, as the item table numbers them. */
const FAMILY_OF: ReadonlyMap<number, WeaponFamily> = new Map([
  [0, 'edge'], // one-handed swords
  [1, 'edge'], // one-handed axes
  [2, 'blunt'], // one-handed maces
  [3, 'dagger'],
  [4, 'fist'],
  [8, 'edge'], // two-handed swords
  [9, 'edge'], // two-handed axes
  [10, 'blunt'], // two-handed hammers
  [11, 'blunt'], // staves
  [12, 'parry'], // spears
  [16, 'arrow'], // bows
  [17, 'arrow'], // crossbows
  [20, 'wand'],
]);

/** The family of what a hand holds; an empty hand, or no weapon, is a fist. */
export function weaponFamily(
  hand: { itemClass: number; subClass: number } | null | undefined,
): WeaponFamily {
  if (!hand || hand.itemClass !== CLASS_WEAPON) return 'fist';
  return FAMILY_OF.get(hand.subClass) ?? 'edge';
}

/** The swing through the air. */
export function swingSound(family: WeaponFamily): string {
  if (family === 'arrow') return 'sfx_weapon_arrow_swoosh_draw_1';
  if (family === 'wand') return 'sfx_weapon_wand_shoot';
  return `sfx_weapon_${family}_swoosh_1`;
}

/** The blow landing on flesh; a critical one lands harder. */
export function impactSound(family: WeaponFamily, critical: boolean): string {
  if (family === 'wand') return 'sfx_weapon_wand_hit';
  return critical
    ? `sfx_weapon_${family}_impact_flesh_critical`
    : `sfx_weapon_${family}_impact_flesh_1`;
}

/** A blow turned aside by the defender's weapon. */
export function parrySound(family: WeaponFamily): string {
  switch (family) {
    case 'edge':
    case 'dagger':
      return 'sfx_weapon_edge_block_1';
    case 'blunt':
    case 'parry':
      return `sfx_weapon_${family}_block_1`;
    default:
      return 'sfx_weapon_block_block_1';
  }
}
