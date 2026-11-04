interface CastFromBarArgs {
  spellId: number;
  /** What a press may cast: the bar's spells, and every spell or mount the book holds. */
  castable: readonly number[];
  mayStartCast: boolean;
  hudTargetId: string | null;
  networkIdOf: (localId: number) => number | undefined;
}

/**
 * Decide whether a cast from the bar or a spell's card is allowed, and which
 * wire target id it uses.
 *
 * Returns null when the press should be ignored.
 */
export function castTargetFromBar(args: CastFromBarArgs): number | null {
  const { spellId, castable, mayStartCast, hudTargetId, networkIdOf } = args;
  if (!castable.includes(spellId)) return null;
  if (!mayStartCast) return null;

  const targetNetworkId = hudTargetId !== null ? networkIdOf(Number(hudTargetId)) : undefined;
  return targetNetworkId ?? 0;
}
