import type { ConnectionEvents } from '../../../net/GameConnection';
import type { NetworkBodies } from '../../../gameplay/NetworkBodies';
import { setQuestGiverStatuses } from '../../../ui/questStore';
import type { World } from '../../../world/World';
import { pendingQuestStatusesToClear } from './pendingQuestStatuses';

/**
 * The mark over each quest giver's head. The server's statuses often beat the
 * giver's body to the client, so those are held until the body arrives.
 */
export class QuestMarks {
  /** Giver statuses that arrived before the giver's body, by network id. */
  private readonly pending = new Map<number, string>();

  constructor(
    private readonly bodies: Pick<NetworkBodies, 'localIdOf'>,
    private readonly world: Pick<World, 'entities' | 'setQuestStatus'>,
    /** Something on the HUD may read differently now. */
    private readonly changed: () => void,
  ) {}

  handlers(): Partial<ConnectionEvents> {
    return {
      onQuestStatuses: statuses => {
        setQuestGiverStatuses(statuses);
        for (const entry of statuses) {
          if (!this.apply(entry.networkId, entry.status)) {
            this.pending.set(entry.networkId, entry.status);
          }
        }
        this.changed();
      },
    };
  }

  /** Whether any status still waits for its giver's body. */
  get waiting(): boolean {
    return this.pending.size > 0;
  }

  /** Give the held statuses to the bodies that have arrived since. */
  settle(): void {
    for (const networkId of pendingQuestStatusesToClear(this.pending, (id, status) =>
      this.apply(id, status),
    )) {
      this.pending.delete(networkId);
    }
  }

  /** Forget what was waiting: it belonged to the map left behind. */
  clear(): void {
    this.pending.clear();
  }

  /** Write a giver's status onto its entity. False if the entity does not exist yet, for the caller to hold. */
  private apply(networkId: number, status: string): boolean {
    const localId = this.bodies.localIdOf(networkId);
    if (localId === undefined) return false;
    const entity = this.world.entities.get(localId);
    if (!entity) return false;
    this.world.setQuestStatus(entity, status);
    return true;
  }
}
