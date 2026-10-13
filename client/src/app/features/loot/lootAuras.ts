import { logger } from '../../../core/log';
import type { CombatVisuals } from '../../../gameplay/CombatVisuals';
import { LootGlow } from '../../../gameplay/loot';
import type { Lootable } from '../../../gameplay/loot';
import type { ConnectionEvents } from '../../../net/GameConnection';
import type { WhoIs } from '../../WhoIs';

const log = logger('loot');

/**
 * The sparkle over a body worth opening. The server names each body's loot
 * state, often before the body is here; the state is kept for every body and
 * handed to the ones that arrive.
 */
export class LootAuras {
  private readonly glow = new LootGlow();

  constructor(
    private readonly whoIs: Pick<WhoIs, 'localIdOf' | 'entity'>,
    private readonly combat: Pick<CombatVisuals, 'showLootGlow' | 'hideLootGlow'>,
  ) {}

  handlers(): Partial<ConnectionEvents> {
    return {
      onEntityLootable: (networkId, lootable) => this.record(networkId, lootable),
    };
  }

  private record(networkId: number, lootable: Lootable): void {
    // Unconditional: the body may not be resident yet (`LootGlow`).
    const worth = this.glow.record(networkId, lootable);
    const local = this.whoIs.localIdOf(networkId);
    const entity = local === undefined ? undefined : this.whoIs.entity(local);
    if (entity) entity.networkLootable = lootable;
    // Records each distinct state this server uses.
    log.once('debug', `lootable:${lootable}`, `loot state ${lootable} seen`);
    if (worth) this.combat.showLootGlow(networkId);
    else this.combat.hideLootGlow(networkId);
  }

  /**
   * Re-assert the glow every frame: the aura can fail to build (model
   * still loading, pool full). `showLootGlow` dedupes, so this is cheap.
   */
  sync(): void {
    for (const [networkId, lootable] of this.glow.openable()) {
      // Walking the record finds bodies that arrived after their loot message.
      const local = this.whoIs.localIdOf(networkId);
      if (local === undefined) continue;
      const entity = this.whoIs.entity(local);
      if (entity) entity.networkLootable = lootable;
      // Once per body: each ask resolved the visual asynchronously.
      if (!this.glow.claimGlow(networkId)) continue;
      this.combat.showLootGlow(networkId);
    }
  }

  /** Forget one body: its id is handed out again. */
  forget(networkId: number): void {
    this.glow.forget(networkId);
  }

  clear(): void {
    this.glow.clear();
  }

  /** Every state recorded, for the debug report. */
  get recorded(): ReadonlyMap<number, Lootable> {
    return this.glow.recorded;
  }
}
