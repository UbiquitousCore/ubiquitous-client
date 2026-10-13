import type { AudioEngine } from '../../../audio/AudioEngine';
import type { PlayClipOptions } from '../../../gameplay/CombatVisuals';
import { LOOT_HOLD_CLIP, LOOT_START_CLIP } from '../../../gameplay/actionClips';

import { handleSound } from '../../../gameplay/itemSounds';
import type { ConnectionEvents, GameConnection } from '../../../net/GameConnection';
import {
  closeLoot,
  lootWindow,
  removeLootMoney,
  removeLootRow,
  setLootActions,
  setLootContents,
} from '../../../ui/lootStore';
import type { UiArt } from '../../UiArt';
/** Held for as long as the window is open: the clip's own start, then the hold. */
const LOOT_ACTION: PlayClipOptions = { hold: true, allBody: true };

const MONEY_SOUND = 'sfx_ui_pickup_money';

/** The hero's own body, for a pose. A no-op until the server has said which body that is. */
export interface HeroClips {
  play(clip: string, options: PlayClipOptions): void;
  stop(): void;
}

/**
 * The loot window: corpses and what they hold. Only server-confirmed changes
 * touch the window, since one that disagrees with the server lets a player
 * take an item twice. The hero kneels over the body for as long as it is open.
 */
export class Looting {
  constructor(
    private readonly connection: GameConnection,
    private readonly art: Pick<UiArt, 'resolveLootArt'>,
    private readonly audio: Pick<AudioEngine, 'play'>,
    private readonly hero: HeroClips,
  ) {}

  handlers(): Partial<ConnectionEvents> {
    return {
      onLootContents: contents => {
        setLootContents(contents);
        // An empty answer closes the window; do not kneel over nothing.
        this.pose(lootWindow.value !== null);
        for (const row of contents.items) this.art.resolveLootArt(row.entry);
      },

      // Sent to everyone nearby; `closeLoot` checks the id so another
      // container going free does not shut ours.
      onLootBusy: (networkId, busy) => {
        if (!busy) this.closeWindow(networkId);
      },

      onLootItemRemoved: (networkId, _looterId, money, slot) => {
        if (money) removeLootMoney(networkId);
        else if (slot !== undefined) removeLootRow(networkId, slot);
        // Only the window emptying stands the player back up.
        if (lootWindow.value === null) this.pose(false);
      },
    };
  }

  /**
   * The window's buttons; rows leave only on the server's message, so a
   * refusal never empties the window.
   */
  installActions(): void {
    setLootActions({
      take: (networkId, slot) => {
        this.connection.sendLootTake(networkId, slot);
        const row = lootWindow.peek()?.items.find(item => item.slot === slot);
        if (row) this.audio.play(handleSound(row, true));
      },
      takeMoney: networkId => {
        this.connection.sendLootTakeMoney(networkId);
        this.audio.play(MONEY_SOUND);
      },
      close: networkId => {
        this.connection.sendLootClose(networkId);
        this.pose(false);
      },
    });
  }

  private closeWindow(networkId: number): void {
    const open = lootWindow.value;
    closeLoot(networkId);
    if (open !== null && open.networkId === networkId) this.pose(false);
  }

  /** Kneel over the body, held for as long as the window is open. */
  private pose(open: boolean): void {
    if (!open) {
      this.hero.stop();
      return;
    }
    this.hero.play(LOOT_START_CLIP, LOOT_ACTION);
    this.hero.play(LOOT_HOLD_CLIP, LOOT_ACTION);
  }
}
