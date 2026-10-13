import { canAttack, interactionFor, type Service } from '../../../gameplay/npcInteraction';
import type { Relation } from '../../../renderer/TargetRing';

/** Whether the hero currently holds a ranged weapon. */
export function hasRangedWeaponEquipped(
  ranged: { entry: number; itemClass: number } | undefined,
  rangedSubclass: number | undefined,
  weaponClass: number,
): boolean {
  if (ranged) return ranged.entry > 0 && ranged.itemClass === weaponClass;
  return rangedSubclass !== undefined;
}

/** Whether the hero may swing at this body. */
export function canAttackEntity(args: {
  kind: string;
  dead: boolean;
  standing: Relation;
}): boolean {
  const { kind, dead, standing } = args;
  return canAttack({
    isBody: kind === 'creature' || kind === 'player',
    isDead: dead,
    enemyOrBystander: standing === 'enemy' || standing === 'bystander',
  });
}

/** What acting on this body means right now. */
export function interactionWithEntity(args: {
  relation: Relation;
  canAttack: boolean;
  interactable: boolean;
}): 'attack' | 'loot' | 'talk' | 'none' {
  const { relation, canAttack, interactable } = args;
  return interactionFor({
    dead: relation === 'corpse',
    canAttack,
    interactable,
  });
}

/** What a click on a body leads to, before any server is asked. */
export type InteractionRoute =
  | { kind: 'loot' }
  | { kind: 'attack' }
  | { kind: 'travel' }
  | { kind: 'service'; service: Exclude<Service, 'travel'> };

/**
 * Where a click goes: a corpse is looted and a body that can be attacked is
 * attacked, whatever services it might offer. Only a body that is neither is
 * asked what service it has, and a teleporter opens its map locally. Null
 * when the click does nothing.
 */
export function routeInteraction(
  interaction: ReturnType<typeof interactionWithEntity>,
  service: Service | null,
): InteractionRoute | null {
  if (interaction === 'loot') return { kind: 'loot' };
  if (interaction === 'attack') return { kind: 'attack' };
  if (interaction === 'none' || service === null) return null;
  if (service === 'travel') return { kind: 'travel' };
  return { kind: 'service', service };
}
