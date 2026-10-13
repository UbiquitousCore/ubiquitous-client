import type { Relation } from '../../../renderer/TargetRing';
import type { ResourceType, Unit } from '../../../ui/hudStore';

interface HudEntity {
  id: number;
  kind: string;
  networkName?: string;
  networkSubName?: string;
  networkLevel?: number;
  networkHealth?: number;
  networkMaxHealth?: number;
  networkPower?: number;
  networkMaxPower?: number;
  networkClass?: number;
  networkDead?: boolean;
  networkInCombat?: boolean;
}

/** HUD world-unit rows from entity records. */
export function hudUnitsFromEntities<T extends HudEntity>(args: {
  entities: readonly T[];
  playerId: number | undefined;
  relationTo: (entity: T) => Relation;
  networkIdOf: (id: number) => number | undefined;
  resourceForClass: (classId: number) => ResourceType;
  dispositionOf: Record<Relation, 'friendly' | 'neutral' | 'hostile'>;
}): Unit[] {
  const { entities, playerId, relationTo, networkIdOf, resourceForClass, dispositionOf } = args;
  return entities
    .filter(
      entity => (entity.kind === 'creature' || entity.kind === 'player') && entity.id !== playerId,
    )
    .map(entity => ({
      id: String(entity.id),
      name: entity.networkName ?? '',
      subName: entity.networkSubName,
      level: entity.networkLevel ?? 0,
      health: entity.networkHealth ?? 0,
      maxHealth: entity.networkMaxHealth ?? 0,
      mana: entity.networkPower ?? 0,
      maxMana: entity.networkMaxPower ?? 0,
      resource: resourceForClass(entity.networkClass ?? 0),
      ...(entity.networkClass ? { classId: entity.networkClass } : {}),
      ...(networkIdOf(entity.id) !== undefined ? { networkId: networkIdOf(entity.id) } : {}),
      disposition: dispositionOf[relationTo(entity)],
      dead: entity.networkDead === true,
      inCombat: entity.networkInCombat === true,
      kind: entity.kind,
    }));
}

/** Nameplate relation rows for remote players. */
export function remotePlayerNameRelations<T extends HudEntity>(
  entities: readonly T[],
  playerId: number | undefined,
  relationTo: (entity: T) => Relation,
): Array<{ id: number; relation: Relation }> {
  return entities
    .filter(entity => entity.kind === 'player' && entity.id !== playerId)
    .map(entity => ({ id: entity.id, relation: relationTo(entity) }));
}
