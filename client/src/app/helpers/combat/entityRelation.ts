import type { Relation } from '../../../renderer/TargetRing';
import { relationOf } from '../../../gameplay/relationship';
import type { RelationSubject } from '../../../gameplay/relationship';

interface RelationEntity {
  id: number;
  kind: string;
  networkDead?: boolean;
  networkHealth?: number;
  networkMaxHealth?: number;
  networkFaction?: number;
  questMark?: string;
}

interface RelationSubjectArgs {
  entity: RelationEntity;
  countFight: boolean;
  networkId: number | undefined;
  isFightingMe: (networkId: number) => boolean;
  isDuellingMe: (networkId: number) => boolean;
}

interface RelationArgs extends RelationSubjectArgs {
  playerFaction: number | undefined;
}

/** Fields relationOf needs, gathered from one world entity. */
export function relationSubjectFromEntity(args: RelationSubjectArgs): RelationSubject {
  const { entity, countFight, networkId, isFightingMe, isDuellingMe } = args;
  return {
    kind: entity.kind,
    dead: entity.networkDead,
    health: entity.networkHealth,
    maxHealth: entity.networkMaxHealth,
    faction: entity.networkFaction,
    fightingMe: countFight && networkId !== undefined && isFightingMe(networkId),
    duellingMe: networkId !== undefined && isDuellingMe(networkId),
  };
}

/** Full relation (includes quest hand-in colouring). */
export function relationToEntity(args: RelationArgs): Relation {
  const { entity, playerFaction } = args;
  return relationOf(
    { ...relationSubjectFromEntity(args), questMark: entity.questMark },
    playerFaction,
  );
}

/** Standing relation (excludes quest hand-in colouring). */
export function standingToEntity(args: RelationArgs): Relation {
  return relationOf(relationSubjectFromEntity(args), args.playerFaction);
}
