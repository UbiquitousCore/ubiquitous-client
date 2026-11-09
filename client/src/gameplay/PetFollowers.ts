/** The pets at players' heels: the server names which pet is out, and each client walks its body. */

import type { Entity, World } from '../world/World';
import type { PendingEntityEvent } from './NetworkBodies';

/** Own choice: a pet sets off once its owner is this far away. */
export const FOLLOW_FROM = 3;
/** Own choice: where a pet stops, this far short of its owner. */
export const FOLLOW_GAP = 2;
/** Own choice: a walking pet this near its stopping place has arrived; a route ends a hair off it. */
const ARRIVED_WITHIN = 0.25;
/** Own choice: past this a pet has lost its owner and is put back beside them. */
export const LOST_AT = 40;
/** Own choice: how often a following pet is given a fresh place to walk to, in seconds. */
const RETARGET_EVERY = 0.2;
/** Own choice: a pet closes on a running or riding owner at 1.5 times the gap per second, never below this. */
const LEAST_SPEED = 6;
/** What nearly every pet's `creature_proto` row reads, for its frame when selected. */
const PET_LEVEL = 1;
const PET_HEALTH = 100;
/** The wire's neutral: a pet is nobody's enemy. */
const NEUTRAL_FACTION = 2;

export interface PetBodies {
  take(event: PendingEntityEvent): void;
  localIdOf(networkId: number): number | undefined;
}

interface Pet {
  readonly networkId: number;
  readonly entry: number;
  spawned: boolean;
  ownerSeen: boolean;
  walking: boolean;
}

/** Where the pet belongs: on the line from its owner towards it, `FOLLOW_GAP` out. */
export function heelSpot(
  owner: readonly [number, number, number],
  pet: readonly [number, number, number],
): [number, number, number] {
  const dx = pet[0] - owner[0];
  const dz = pet[2] - owner[2];
  const away = Math.hypot(dx, dz) || 1;
  return [owner[0] + (dx / away) * FOLLOW_GAP, owner[1], owner[2] + (dz / away) * FOLLOW_GAP];
}

export class PetFollowers {
  private readonly pets = new Map<number, Pet>();
  private nextId = -1;
  private sinceRetarget = 0;

  constructor(
    private readonly world: Pick<World, 'entities'>,
    private readonly bodies: PetBodies,
    private readonly ownerOf: (networkId: number) => Entity | undefined,
  ) {}

  /** One pet to an owner: a new one replaces the last, and entry 0 sends it away. */
  setPet(owner: number, entry: number): void {
    this.dismiss(owner);
    if (entry <= 0) return;
    this.pets.set(owner, {
      networkId: this.nextId--,
      entry,
      spawned: false,
      ownerSeen: false,
      walking: false,
    });
  }

  /** The world and every body in it are about to go; a zone change leaves pets behind. */
  clear(): void {
    this.pets.clear();
  }

  update(dt: number): void {
    this.sinceRetarget += dt;
    if (this.sinceRetarget < RETARGET_EVERY) return;
    this.sinceRetarget = 0;
    for (const [ownerId, pet] of this.pets) {
      const owner = this.ownerOf(ownerId);
      if (owner) this.follow(pet, owner);
      else if (pet.ownerSeen) this.dismiss(ownerId);
    }
  }

  private follow(pet: Pet, owner: Entity): void {
    pet.ownerSeen = true;
    if (!pet.spawned) {
      pet.spawned = true;
      this.bodies.take({ kind: 'spawned', snapshot: this.snapshotOf(pet, owner) });
      return;
    }
    const local = this.bodies.localIdOf(pet.networkId);
    const body = local === undefined ? undefined : this.world.entities.get(local);
    if (!body) return;

    const networkId = pet.networkId;
    const away = Math.hypot(
      owner.position[0] - body.position[0],
      owner.position[2] - body.position[2],
    );
    if (away > LOST_AT) {
      const position = beside(owner);
      pet.walking = false;
      this.bodies.take({ kind: 'moved', move: { networkId, position, moving: false } });
    } else if (away > FOLLOW_FROM || (pet.walking && away > FOLLOW_GAP + ARRIVED_WITHIN)) {
      pet.walking = true;
      const target = heelSpot(owner.position, body.position);
      const speed = Math.max(LEAST_SPEED, away * 1.5);
      this.bodies.take({ kind: 'moved', move: { networkId, target, moving: true, speed } });
    } else if (pet.walking) {
      pet.walking = false;
      this.bodies.take({ kind: 'moved', move: { networkId, moving: false } });
    }
  }

  private dismiss(owner: number): void {
    const pet = this.pets.get(owner);
    if (!pet) return;
    this.pets.delete(owner);
    if (pet.spawned) this.bodies.take({ kind: 'removed', networkId: pet.networkId });
  }

  private snapshotOf(pet: Pet, owner: Entity) {
    return {
      networkId: pet.networkId,
      entry: pet.entry,
      displayInfoId: 0,
      race: 0,
      gender: 0,
      appearance: { skin: 0, hairStyle: 0, hairColour: 0, face: 0 },
      equipment: [],
      animationId: 0,
      level: PET_LEVEL,
      health: PET_HEALTH,
      maxHealth: PET_HEALTH,
      faction: NEUTRAL_FACTION,
      companion: true,
      position: beside(owner),
      orientation: 0,
    };
  }
}

function beside(owner: Entity): [number, number, number] {
  return [owner.position[0] + FOLLOW_GAP, owner.position[1], owner.position[2]];
}
