import type { SpellStats } from '../../../assets/types';
import type { ActionBarRecord } from '../../../gameplay/SpellBook';
import { listedThoughNotCastable } from '../../../gameplay/spellBookPages';

/** What the spell book asks the player's own tables. */
export interface SpellBookTables {
  spellCastable(spellId: number): Promise<boolean>;
  spellStats(spellId: number): Promise<SpellStats>;
  spellName(spellId: number): Promise<string | null>;
  /** What the spell does, which its card shows. */
  spellText(spellId: number): Promise<string | null>;
  spellIcon(spellId: number): Promise<ImageBitmap | null>;
  spellCastingTime(spellId: number): Promise<number>;
  spellRank(spellId: number): Promise<number>;
}

/** Where the answers go. */
export interface SpellBookSinks {
  install(spells: number[], actionBar: ActionBarRecord[], listed: number[]): void;
  mountSpells(ids: number[]): void;
  petSpells(ids: number[]): void;
  stats(spellId: number, stats: SpellStats): void;
  name(spellId: number, name: string): void;
  text(spellId: number, text: string): void;
  icon(spellId: number, icon: ImageBitmap): void;
  castTime(spellId: number, ms: number): void;
  rank(spellId: number, rank: number): void;
}

/** What a spell whose row cannot be read is taken to be: not a mount, in no set. */
const UNREAD: SpellStats = {
  powerCost: 0,
  castMs: 0,
  cooldownMs: 0,
  range: 0,
  mount: false,
  pet: false,
  skillSet: 0,
  skillSetIcon: null,
};

/**
 * Install the server's spell list (everything, passives included) and fill
 * in from the tables what the book lists and which spells are mounts; the
 * bar goes in as sent. Resolves with the listed ids before names and icons land.
 */
export async function loadSpellBook(
  spells: number[],
  actionBar: ActionBarRecord[],
  tables: SpellBookTables,
  sinks: SpellBookSinks,
): Promise<number[]> {
  const [castable, stats, names] = await Promise.all([
    Promise.all(spells.map(spellId => tables.spellCastable(spellId))),
    Promise.all(spells.map(spellId => tables.spellStats(spellId).catch(() => UNREAD))),
    Promise.all(spells.map(spellId => tables.spellName(spellId).catch(() => null))),
  ]);
  const listed = spells.filter(
    (_, at) =>
      castable[at] ||
      (!stats[at]!.mount && listedThoughNotCastable(stats[at]!.skillSet, names[at] ?? '')),
  );
  spells.forEach((spellId, at) => {
    sinks.stats(spellId, stats[at]!);
    const name = names[at];
    if (name) sinks.name(spellId, name);
  });
  sinks.install(spells, actionBar, listed);
  sinks.mountSpells(spells.filter((_, at) => stats[at]!.mount));
  sinks.petSpells(spells.filter((_, at) => stats[at]!.pet));
  for (const spellId of spells) {
    // Asked here, not when a card opens: a card asks only for figures it lacks, and these are in.
    void tables
      .spellText(spellId)
      .then(text => {
        if (text) sinks.text(spellId, text);
      })
      .catch(() => {});
    void tables.spellIcon(spellId).then(icon => {
      if (icon) sinks.icon(spellId, icon);
    });
    void tables.spellCastingTime(spellId).then(ms => sinks.castTime(spellId, ms));
    void tables.spellRank(spellId).then(rank => sinks.rank(spellId, rank));
  }
  return listed;
}
