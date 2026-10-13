/**
 * The clips a body plays to loot and to die, by the clip names the user's
 * `c_animationdata` table lists. The same name plays on every model, so the
 * client asks for the clip by name rather than through a table row. Attack
 * clips are in `combatResults.ts`.
 */

/**
 * Kneeling at an open body: a one-shot crouch that settles into a held one,
 * held for as long as the loot window is up.
 */
export const LOOT_START_CLIP = 'pickup_start';
export const LOOT_HOLD_CLIP = 'pickup_hold';

/**
 * The spells that gather from an object: the mine, ordinary and chest rows the
 * user's spell table names "Gather mine", "Gather normal" and "Gather chest".
 */
export const GATHER_SPELL_IDS: ReadonlySet<number> = new Set([23, 57, 1822]);

/**
 * What a gatherer holds while the gather plays, by spell, for show only: it is
 * never equipped. Mining holds item 13, whose icon is the pick's and whose model
 * is the miner's dig (the owner's recollection of play).
 */
export const GATHER_HELD_ITEMS: ReadonlyMap<number, number> = new Map([[23, 13]]);

/** The fall a body plays when it dies, and holds as a corpse. */
export const DEATH_CLIP = 'die_ground';

/** Every clip named here, for checking against the user's table. */
export const ACTION_CLIPS: readonly string[] = [LOOT_START_CLIP, LOOT_HOLD_CLIP, DEATH_CLIP];
