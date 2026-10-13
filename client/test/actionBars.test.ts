/**
 * The saved action bars.
 *
 * The server sends two bars — a six-slot primary one and a thirty-two-slot
 * shortcut one — and what it sends is a *layout*: which positions hold what,
 * and which the player deliberately left empty. Every rule asserted here has a
 * way of being lost quietly: compact the list and the gaps close, truncate it
 * and the shortcut bar disappears, filter it and a saved spell vanishes from a
 * slot the player put it in.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  BAR_SLOTS,
  MOUNT_SLOT,
  WHEEL_FIRST,
  WHEEL_SLOTS,
  wheelSlots,
  PRIMARY_BAR_SLOTS,
  SHORTCUT_BAR_SLOTS,
  ACTION_SLOT_ITEM,
  ACTION_SLOT_SPELL,
  actionBar,
  assignSpell,
  dedupeRanks,
  initSpells,
  knownSpells,
  assignActionBar,
  setActionSlotSink,
  mountSlot,
  setMountSpells,
  setSpellName,
  setSpellRank,
  shortcutSlots,
  assignBarSlot,
  barSlotOf,
  barSlots,
  spellBar,
  spellNames,
  spellRanks,
} from '../src/gameplay/SpellBook';
import type { ActionBarRecord } from '../src/gameplay/SpellBook';

/** Every slot of both bars, saved empty. */
function savedEmpty(): ActionBarRecord[] {
  const records: ActionBarRecord[] = [];
  for (let slot = 0; slot < PRIMARY_BAR_SLOTS; slot++) {
    records.push({ bar: 'primary', slot, id: 0, type: ACTION_SLOT_SPELL });
  }
  for (let slot = 0; slot < SHORTCUT_BAR_SLOTS; slot++) {
    records.push({ bar: 'shortcut', slot, id: 0, type: ACTION_SLOT_SPELL });
  }
  return records;
}

function at(
  records: ActionBarRecord[],
  bar: 'primary' | 'shortcut',
  slot: number,
  patch: Partial<ActionBarRecord>,
): ActionBarRecord[] {
  return records.map(r => (r.bar === bar && r.slot === slot ? { ...r, ...patch } : r));
}

beforeEach(() => {
  setActionSlotSink(null);
  spellNames.value = new Map();
  spellRanks.value = new Map();
  initSpells([], savedEmpty());
});

describe('the saved layout', () => {
  it('keeps both bars at their full saved length', () => {
    initSpells([133], savedEmpty());
    expect(actionBar.value).toHaveLength(PRIMARY_BAR_SLOTS);
    expect(shortcutSlots.value).toHaveLength(SHORTCUT_BAR_SLOTS);
  });

  it('keeps a spell at the non-contiguous slot it was saved at', () => {
    // Nothing in slots 0-3; a spell in 4. Compacting puts it in slot 0, which
    // is a different layout from the one the player saved.
    let records = savedEmpty();
    records = at(records, 'primary', 4, { id: 133, type: ACTION_SLOT_SPELL });
    records = at(records, 'shortcut', 17, { id: 271, type: ACTION_SLOT_SPELL });
    initSpells([133, 271], records);

    expect(actionBar.value.map(s => s.spellId)).toEqual([null, null, null, null, 133, null]);
    expect(shortcutSlots.value[17]!.spellId).toBe(271);
    expect(shortcutSlots.value.filter(s => s.spellId !== null)).toHaveLength(1);
  });

  it('keeps a saved item slot, which names no spell', () => {
    const records = at(savedEmpty(), 'shortcut', 2, { id: 8001, type: ACTION_SLOT_ITEM });
    initSpells([], records);
    expect(shortcutSlots.value[2]).toMatchObject({ spellId: null, itemId: 8001 });
  });

  it.each(['primary', 'shortcut'] as const)(
    'drops a saved %s-bar spell the character does not know, and leaves the gap',
    bar => {
      // Both bars keep a saved spell only when the character's own spell list
      // has it. A dropped one leaves its slot empty; it does not pull the slot
      // after it forward.
      let records = savedEmpty();
      records = at(records, bar, 1, { id: 999, type: ACTION_SLOT_SPELL });
      records = at(records, bar, 2, { id: 133, type: ACTION_SLOT_SPELL });
      initSpells([133], records);
      const slots = bar === 'primary' ? actionBar.value : shortcutSlots.value;
      expect(slots.slice(0, 4).map(s => s.spellId)).toEqual([null, null, 133, null]);
    },
  );

  it('offers only castable spells in the book, whatever the bar holds', () => {
    // A mount or a passive is a known spell and can sit in a saved slot; it
    // is not something the book offers to cast.
    const records = at(savedEmpty(), 'primary', 0, { id: 500, type: ACTION_SLOT_SPELL });
    initSpells([133, 500], records, [133]);
    expect(actionBar.value[0]!.spellId).toBe(500);
  });
});

describe('changes', () => {
  it('applies a single saved slot update without disturbing the rest', () => {
    initSpells([133], at(savedEmpty(), 'primary', 0, { id: 133, type: ACTION_SLOT_SPELL }));
    assignActionBar({ bar: 'primary', slot: 3, id: 271, type: ACTION_SLOT_SPELL });
    expect(actionBar.value.map(s => s.spellId)).toEqual([133, null, null, 271, null, null]);
  });

  it('saves an assignment back, naming the bar and the slot within it', () => {
    const saved: ActionBarRecord[] = [];
    setActionSlotSink(record => saved.push(record));

    assignSpell(2, 133);
    assignSpell(5, 271, 'shortcut');
    assignSpell(2, null);

    expect(saved).toEqual([
      { bar: 'primary', slot: 2, id: 133, type: ACTION_SLOT_SPELL },
      { bar: 'shortcut', slot: 5, id: 271, type: ACTION_SLOT_SPELL },
      // Clearing is an empty record, not a missing one.
      { bar: 'primary', slot: 2, id: 0, type: ACTION_SLOT_ITEM },
    ]);
    expect(actionBar.value[2]!.spellId).toBeNull();
    expect(shortcutSlots.value[5]!.spellId).toBe(271);
  });

  it('ignores an assignment past the end of a bar', () => {
    const saved: ActionBarRecord[] = [];
    setActionSlotSink(record => saved.push(record));
    assignSpell(PRIMARY_BAR_SLOTS, 133);
    expect(saved).toEqual([]);
  });
});

describe('the bar of twelve', () => {
  beforeEach(() => setActionSlotSink(null));

  it('stands for the six primary slots and then the first six shortcut slots', () => {
    expect(barSlotOf(0)).toEqual({ bar: 'primary', slot: 0 });
    expect(barSlotOf(5)).toEqual({ bar: 'primary', slot: 5 });
    expect(barSlotOf(6)).toEqual({ bar: 'shortcut', slot: 0 });
    expect(barSlotOf(11)).toEqual({ bar: 'shortcut', slot: 5 });
    expect(BAR_SLOTS).toBe(12);
  });

  it('shows the saved layout where anything is saved, empties kept', () => {
    initSpells(
      [1, 2, 3],
      [
        { bar: 'primary', slot: 1, id: 2, type: 0 },
        { bar: 'shortcut', slot: 0, id: 3, type: 0 },
      ],
    );
    expect(barSlots.value).toEqual([
      null,
      2,
      null,
      null,
      null,
      null,
      3,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(spellBar.value).toEqual([2, 3]);
  });

  it('offers the mount in its own slot for casting, as it does what the bar holds', () => {
    initSpells([2, 6978], at(savedEmpty(), 'primary', 0, { id: 2 }));
    setMountSpells([6978]);
    expect(mountSlot.value).toBe(6978);
    expect(spellBar.value).toEqual([2, 6978]);
    setMountSpells([]);
  });

  it('shows the known spells in order while nothing at all is saved', () => {
    initSpells([7, 8, 9], []);
    expect(barSlots.value).toEqual([7, 8, 9, null, null, null, null, null, null, null, null, null]);
  });

  it('saves a drop in the slot the server keeps for that button, keeping the pre-filled buttons', () => {
    const saved: ActionBarRecord[] = [];
    setActionSlotSink(record => saved.push(record));
    initSpells([7, 8], []);
    // Nothing saved yet: the bar shows 7 and 8. Dropping 8 onto socket 9
    // must not empty socket 1 — the shown layout is saved along with it.
    assignBarSlot(8, 8);
    expect(saved).toEqual([
      { bar: 'primary', slot: 0, id: 7, type: 0 },
      { bar: 'primary', slot: 1, id: 8, type: 0 },
      { bar: 'shortcut', slot: 2, id: 8, type: 0 },
    ]);
    expect(barSlots.value).toEqual([7, 8, null, null, null, null, null, null, 8, null, null, null]);
    // From here on only the one slot is saved.
    assignBarSlot(3, 7);
    expect(saved).toHaveLength(4);
    expect(saved[3]).toEqual({ bar: 'primary', slot: 3, id: 7, type: 0 });
    assignBarSlot(WHEEL_FIRST + WHEEL_SLOTS, 7);
    expect(saved).toHaveLength(4);
  });
});

describe('the ring’s slots', () => {
  beforeEach(() => setActionSlotSink(null));

  it('start empty, whatever the bar shows', () => {
    initSpells([7, 8], []);
    expect(wheelSlots.value).toEqual(new Array(WHEEL_SLOTS).fill(null));
  });

  it('take a spell into the shortcut slots after the bar’s own, and save it there', () => {
    const saved: ActionBarRecord[] = [];
    setActionSlotSink(record => saved.push(record));
    initSpells([7], at(savedEmpty(), 'primary', 0, { id: 7, type: ACTION_SLOT_SPELL }));
    assignBarSlot(WHEEL_FIRST + 2, 7);
    expect(wheelSlots.value[2]).toBe(7);
    expect(saved).toEqual([{ bar: 'shortcut', slot: 8, id: 7, type: ACTION_SLOT_SPELL }]);
    // The bar's own slots are not touched.
    expect(barSlots.value[8]).toBeNull();
  });
});

describe('the mount’s slot', () => {
  beforeEach(() => {
    setActionSlotSink(null);
    setMountSpells([]);
    assignBarSlot(MOUNT_SLOT, null);
  });

  it('is the one after the twelve', () => {
    expect(MOUNT_SLOT).toBe(BAR_SLOTS);
  });

  it('holds the first mount the player has until they choose another', () => {
    setMountSpells([900, 901]);
    expect(mountSlot.value).toBe(900);
    assignBarSlot(MOUNT_SLOT, 901);
    expect(mountSlot.value).toBe(901);
    assignBarSlot(MOUNT_SLOT, null);
    expect(mountSlot.value).toBe(900);
  });

  it('takes only a mount, and saves nothing for it', () => {
    const saved: ActionBarRecord[] = [];
    setActionSlotSink(record => saved.push(record));
    setMountSpells([900]);
    assignBarSlot(MOUNT_SLOT, 900);
    expect(mountSlot.value).toBe(900);
    assignBarSlot(MOUNT_SLOT, 133);
    expect(mountSlot.value).toBe(900);
    expect(saved).toEqual([]);
  });

  it('goes back to the first mount the player has when the one chosen is gone', () => {
    setMountSpells([900, 901]);
    assignBarSlot(MOUNT_SLOT, 901);
    setMountSpells([900]);
    expect(mountSlot.value).toBe(900);
  });

  it('is empty when the player has no mount', () => {
    expect(mountSlot.value).toBeNull();
  });
});

describe('spell rank dedupe', () => {
  it('leaves a spell alone when its name has not resolved yet', () => {
    expect(dedupeRanks([7, 8, 9], new Map(), new Map())).toEqual([7, 8, 9]);
  });

  it('keeps only the highest-ranked id once two spells share a name', () => {
    const names = new Map([
      [1, 'Sample Flame'],
      [2, 'Sample Flame'],
      [3, 'Sample Flame'],
    ]);
    const ranks = new Map([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    expect(dedupeRanks([1, 2, 3], names, ranks)).toEqual([3]);
  });

  it('keeps the arrival order of the surviving ids', () => {
    const names = new Map([
      [1, 'Sample Flame'],
      [2, 'Sample Bolt'],
      [3, 'Sample Flame'],
    ]);
    const ranks = new Map([
      [1, 2],
      [2, 1],
      [3, 1],
    ]);
    // Sample Flame's higher rank (id 1) wins, but Sample Bolt (id 2) still comes
    // before it — the order the ids first arrived in, not sorted by name.
    expect(dedupeRanks([1, 2, 3], names, ranks)).toEqual([1, 2]);
  });

  it('treats an unranked spell as rank 1, not as missing', () => {
    const names = new Map([
      [1, 'Charge'],
      [2, 'Charge'],
    ]);
    const ranks = new Map([[2, 2]]); // spell 1 carries no rank at all
    expect(dedupeRanks([1, 2], names, ranks)).toEqual([2]);
  });

  it('knownSpells dedupes the server list once names and ranks resolve', () => {
    initSpells([1, 2, 3], [], [1, 2, 3]);
    expect(knownSpells.value).toEqual([1, 2, 3]); // unresolved: nothing collapses yet
    setSpellName(1, 'Sample Flame');
    setSpellName(2, 'Sample Flame');
    setSpellName(3, 'Sample Bolt');
    setSpellRank(1, 1);
    setSpellRank(2, 2);
    setSpellRank(3, 1);
    expect(knownSpells.value).toEqual([2, 3]);
  });
});
