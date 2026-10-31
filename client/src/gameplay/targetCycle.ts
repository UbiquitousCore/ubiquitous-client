/** A body that could be selected, and how far it is from the player. */
export interface TargetCandidate {
  id: number;
  distance: number;
}

/**
 * Who comes next when stepping through what is near, nearest first. With
 * nothing selected, stepping forward picks the nearest and stepping back
 * the farthest; from a selection, it moves one along and wraps round. A
 * selection that has left range starts the walk again as if there were none.
 */
export function nextTarget(
  candidates: readonly TargetCandidate[],
  current: number | null,
  step: 1 | -1,
): number | null {
  if (candidates.length === 0) return null;
  const ordered = [...candidates].sort((a, b) => a.distance - b.distance || a.id - b.id);
  const at = current === null ? -1 : ordered.findIndex(c => c.id === current);
  if (at === -1) return (step === 1 ? ordered[0] : ordered[ordered.length - 1]).id;
  return ordered[(at + step + ordered.length) % ordered.length].id;
}
