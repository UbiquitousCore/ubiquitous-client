/** Loot window container: reads the stored body, resolves art/words, turns
 * taps into requests. */

import type { JSX } from 'preact';
import type { LootRow } from '../net/GameConnection';
import { useWornScreen } from './art/useWorn';
import { ArtLootWindow, LOOT_SCREEN } from './components/ArtLootWindow';
import type { LootEntry } from './components/ArtLootWindow';
import { itemFacts, itemIcons, itemNames } from './inventoryStore';
import { dismissLoot, lootActions, lootWindow } from './lootStore';
import { formatMoney } from './money';

/**
 * A row as the plinth draws it.
 *
 * The picture, the name and the quality are read out of their signals during
 * this window's own render, which is what makes art arriving from the pack
 * redraw the plinth that was waiting for it.
 */
function entry(row: LootRow): LootEntry {
  return {
    slot: row.slot,
    entry: row.entry,
    item: {
      // The server's own id, so two of the same entry on one body stay two
      // rows rather than collapsing into one key.
      id: row.itemId || `${row.entry}-${row.slot}`,
      name: itemNames.value.get(row.entry) ?? `Item ${row.entry}`,
      // The user's own item row says how good the item is; the loot row
      // carries no quality of its own.
      quality: itemFacts.value.get(row.entry)?.quality ?? row.quality,
      count: row.count,
      icon: itemIcons.value.get(row.entry) ?? null,
    },
  };
}

export function LootWindowContainer(): JSX.Element | null {
  // Asked before anything else, so the same hooks run open or shut.
  const worn = useWornScreen(LOOT_SCREEN);
  const open = lootWindow.value;
  if (!open) return null;

  const actions = lootActions();
  const entries = open.items.map(entry);
  const canTakeAll = open.money > 0 || open.items.length > 0;

  const props = {
    // The body's own name is not on this message and this client does not
    // keep dead creatures' names by id, so the window says what it is
    // rather than whose it was.
    title: 'Loot',
    money: open.money > 0 ? formatMoney(open.money) : undefined,
    entries,
    onTake: (slot: number) => actions.take(open.networkId, slot),
    onTakeMoney: () => actions.takeMoney(open.networkId),
    onTakeAll: canTakeAll
      ? () => {
          // The coin first, then every row. Each is a separate request and the server
          // answers each on its own, so nothing is removed here.
          if (open.money > 0) actions.takeMoney(open.networkId);
          for (const row of open.items) actions.take(open.networkId, row.slot);
        }
      : undefined,
    onClose: dismissLoot,
  };

  return worn ? <ArtLootWindow {...props} copper={open.money} /> : null;
}
