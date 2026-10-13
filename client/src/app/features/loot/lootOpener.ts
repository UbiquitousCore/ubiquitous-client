import { logger } from '../../../core/log';
import { reportToPlayer } from '../../../gameplay/SpellBook';
import { decideLoot } from '../../../gameplay/loot';
import type { GameConnection } from '../../../net/GameConnection';
import type { EntityId } from '../../../world/World';
import type { WhoIs } from '../../WhoIs';

const log = logger('loot');

/** What a click on a body decided, for `ubiquitous.loot()`; every refusal is silent. */
export interface LootAttemptRecord {
  networkId: number;
  entry: number;
  distance: number | null;
  why: string;
  sent: boolean;
}

/**
 * A click on a body: open it from close enough. The server refuses past ten
 * units and says nothing, so the refusals are decided and said here.
 */
export class LootOpener {
  constructor(
    private readonly connection: Pick<GameConnection, 'sendLootOpen'>,
    private readonly whoIs: Pick<
      WhoIs,
      'entity' | 'networkIdOf' | 'heroPosition' | 'positionOf' | 'isOwnBody' | 'relationTo'
    >,
    private readonly record: (attempt: LootAttemptRecord) => void,
    private readonly reach: number,
  ) {}

  /** Whether the request to open was sent. */
  open(id: EntityId): boolean {
    const entity = this.whoIs.entity(id);
    const networkId = entity ? this.whoIs.networkIdOf(id) : undefined;
    const here = this.whoIs.heroPosition();
    const there = networkId === undefined ? undefined : this.whoIs.positionOf(networkId);
    const decision = decideLoot(
      {
        exists: entity !== undefined,
        isOwn: this.whoIs.isOwnBody(id),
        isDead: entity !== undefined && this.whoIs.relationTo(entity) === 'corpse',
        networkId,
        distance:
          here && there
            ? Math.hypot(here[0] - there[0], here[1] - there[1], here[2] - there[2])
            : null,
      },
      this.reach,
    );
    const entry = entity?.entry;

    if (!decision.open) {
      if (decision.tell) reportToPlayer(decision.tell);
      this.record({
        networkId: decision.networkId ?? 0,
        entry: entry ?? 0,
        distance: decision.distance ?? null,
        why: decision.why,
        sent: false,
      });
      return false;
    }

    this.connection.sendLootOpen(decision.networkId);
    this.record({
      networkId: decision.networkId,
      entry: entry ?? 0,
      distance: decision.distance,
      why: 'sent',
      sent: true,
    });
    log.info(`loot: asked to open ${decision.networkId} (entry ${entry})`);
    return true;
  }
}
