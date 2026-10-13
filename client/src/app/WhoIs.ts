import type { NetworkBodies } from '../gameplay/NetworkBodies';
import type { Relation } from '../renderer/TargetRing';
import { targetId as hudTargetId } from '../ui/hudStore';
import { isDuellingMe } from '../ui/pvpStore';
import type { Entity, EntityId, World } from '../world/World';
import { isOwnBodyId } from './helpers/combat/entityOwnership';
import { relationToEntity, standingToEntity } from './helpers/combat/entityRelation';

/** What the session knows about the hero that these lookups need, read when asked. */
export interface WhoIsSession {
  /** The server's id for the hero's own body; 0 until `world.entered`. */
  selfNetworkId(): number;
  playerFaction(): number | undefined;
  isFightingMe(networkId: number): boolean;
}

/**
 * "Who is this network id?" Loot, social and quest code all ask the same few
 * questions of the server's ids; this is the one place that answers them.
 */
export class WhoIs {
  constructor(
    private readonly bodies: Pick<NetworkBodies, 'networkIdOf' | 'localIdOf' | 'worldPosition'>,
    private readonly world: Pick<World, 'entities' | 'player'>,
    private readonly session: WhoIsSession,
  ) {}

  /** The server's id for the hero's own body; 0 until the server has said. */
  selfNetworkId(): number {
    return this.session.selfNetworkId();
  }

  /** Never true for 0, which is what the hero's id is until the server has said. */
  isSelf(networkId: number): boolean {
    return networkId !== 0 && networkId === this.session.selfNetworkId();
  }

  /** The name a body carries, or null when it is unknown, despawned or unnamed. */
  networkName(networkId: number): string | null {
    const local = this.bodies.localIdOf(networkId);
    const name = local === undefined ? undefined : this.world.entities.get(local)?.networkName;
    return name || null;
  }

  positionOf(networkId: number): [number, number, number] | null {
    return this.bodies.worldPosition(networkId);
  }

  localIdOf(networkId: number): EntityId | undefined {
    return this.bodies.localIdOf(networkId);
  }

  /** The body a network id stands for, if the world still holds it. */
  entityOf(networkId: number): Entity | undefined {
    const local = this.bodies.localIdOf(networkId);
    return local === undefined ? undefined : this.world.entities.get(local);
  }

  entity(id: EntityId): Entity | undefined {
    return this.world.entities.get(id);
  }

  networkIdOf(id: EntityId): number | undefined {
    return this.bodies.networkIdOf(id);
  }

  /** Where the hero stands, or null before there is one. */
  heroPosition(): [number, number, number] | null {
    const at = this.world.player?.position;
    return at ? [at[0], at[1], at[2]] : null;
  }

  /** Either route may be the one known: the world's player, or the server's id for us. */
  isOwnBody(id: EntityId): boolean {
    return isOwnBodyId({
      id,
      playerId: this.world.player?.id,
      networkId: this.bodies.networkIdOf(id),
      isSelfNetworkId: networkId => this.isSelf(networkId),
    });
  }

  /** How the hero relates to a unit (`gameplay/relationship.ts`); `countFight` false ignores the fight. */
  relationTo(entity: Entity, countFight = true): Relation {
    return relationToEntity(this.relationArgs(entity, countFight));
  }

  /** Side and fight only, without the quest mark: decides what may be attacked. */
  standingTo(entity: Entity, countFight = true): Relation {
    return standingToEntity(this.relationArgs(entity, countFight));
  }

  /** The wire id of the HUD's target; `ui/` only ever sees local ids. */
  targetNetworkId(): number | undefined {
    const local = hudTargetId.value;
    return local === null ? undefined : this.bodies.networkIdOf(Number(local));
  }

  private relationArgs(entity: Entity, countFight: boolean) {
    return {
      entity,
      playerFaction: this.session.playerFaction(),
      countFight,
      networkId: this.bodies.networkIdOf(entity.id),
      isFightingMe: (networkId: number) => this.session.isFightingMe(networkId),
      isDuellingMe: (networkId: number) => isDuellingMe(networkId),
    };
  }
}
