import type { ActionBarRecord } from '../../../gameplay/SpellBook';

/** What the spell book asks the player's own tables. */
export interface SpellBookTables {
  spellCastable(spellId: number): Promise<boolean>;
  spellStats(spellId: number): Promise<{ mount: boolean }>;
  spellName(spellId: number): Promise<string | null>;
  spellIcon(spellId: number): Promise<ImageBitmap | null>;
  spellCastingTime(spellId: number): Promise<number>;
  spellRank(spellId: number): Promise<number>;
}

/** Where the answers go. */
export interface SpellBookSinks {
  install(spells: number[], actionBar: ActionBarRecord[], castable: number[]): void;
  mountSpells(ids: number[]): void;
  name(spellId: number, name: string): void;
  icon(spellId: number, icon: ImageBitmap): void;
  castTime(spellId: number, ms: number): void;
  rank(spellId: number, rank: number): void;
}

/**
 * Install the server's spell list (everything, passives included) and fill
 * in from the tables what is castable and which spells are mounts; the bar
 * goes in as sent. Resolves with castable ids before names and icons land.
 */
export async function loadSpellBook(
  spells: number[],
  actionBar: ActionBarRecord[],
  tables: SpellBookTables,
  sinks: SpellBookSinks,
): Promise<number[]> {
  const results = await Promise.all(
    spells.map(spellId => tables.spellCastable(spellId).then(ok => ({ spellId, ok }))),
  );
  const castable = results.filter(r => r.ok).map(r => r.spellId);
  sinks.install(spells, actionBar, castable);
  void Promise.all(spells.map(spellId => tables.spellStats(spellId)))
    .then(stats => sinks.mountSpells(spells.filter((_, at) => stats[at]!.mount)))
    .catch(() => {});
  for (const spellId of spells) {
    void tables.spellName(spellId).then(name => {
      if (name) sinks.name(spellId, name);
    });
    void tables.spellIcon(spellId).then(icon => {
      if (icon) sinks.icon(spellId, icon);
    });
    void tables.spellCastingTime(spellId).then(ms => sinks.castTime(spellId, ms));
    void tables.spellRank(spellId).then(rank => sinks.rank(spellId, rank));
  }
  return castable;
}
