interface CastFromBarArgs {
  spellId: number;
  bar: readonly number[];
  mayStartCast: boolean;
  hudTargetId: string | null;
  networkIdOf: (localId: number) => number | undefined;
}

/**
 * Decide whether a hotbar cast is allowed, and which wire target id it uses.
 *
 * Returns null when the press should be ignored.
 */
export function castTargetFromBar(args: CastFromBarArgs): number | null {
  const { spellId, bar, mayStartCast, hudTargetId, networkIdOf } = args;
  if (!bar.includes(spellId)) return null;
  if (!mayStartCast) return null;

  const targetNetworkId = hudTargetId !== null ? networkIdOf(Number(hudTargetId)) : undefined;
  return targetNetworkId ?? 0;
}
