/** The server's names for replicated unit values (its `docs/architecture/wire-codes.md`); a batch names only what moved. */
export const FIELD_IDS = {
  level: 'level',
  health: 'health',
  maxHealth: 'maxHealth',
  /** Mana, morale or vigor — one channel, whichever the class uses. */
  power: 'power',
  maxPower: 'maxPower',
  /** 1 while the body is stealthed, 0 once it is not; see `gameplay/auraState.ts`. */
  stealthed: 'stealthed',
  /** 1 while the body is stunned, 0 once it is not; see `gameplay/auraState.ts`. */
  stunned: 'stunned',
  /** The `mountprototype` row the body rides, 0 on foot. */
  mount: 'mount',
  /**
   * How fast the player may move, as a percent of normal speed: lower while
   * slowed, 0 while stunned. The server refuses a longer step.
   */
  moveSpeed: 'moveSpeed',
  xp: 'xp',
  xpToLevel: 'xpToNextLevel',
  /** The player's own purse, in copper. */
  gold: 'gold',
  /**
   * The player's own four attributes with everything worn and active, and
   * the same four with nothing added. Only the player's own client is sent
   * them.
   */
  strength: 'strength',
  agility: 'agility',
  stamina: 'stamina',
  wisdom: 'wisdom',
  baseStrength: 'baseStrength',
  baseAgility: 'baseAgility',
  baseStamina: 'baseStamina',
  baseWisdom: 'baseWisdom',
  /**
   * The player's own character sheet, worked out as the server rolls each
   * blow. A chance is in hundredths of a percent: 9500 is 95%.
   */
  attackPower: 'attackPower',
  hitChance: 'hitChance',
  critChance: 'critChance',
  spellPower: 'spellPower',
  healingPower: 'healingPower',
  spellHitChance: 'spellHitChance',
  spellCritChance: 'spellCritChance',
  armor: 'armor',
  armorMitigation: 'armorMitigation',
  dodgeChance: 'dodgeChance',
  parryChance: 'parryChance',
  blockChance: 'blockChance',
} as const;
