/** A purse update: the new amount and the gain to announce (none on a session's first push). Null if unchanged. */
export function moneyChange(
  previous: number | null,
  next: number | undefined,
): { money: number; gained: number | null } | null {
  if (next === undefined || next === previous) return null;
  return { money: next, gained: previous === null ? null : next - previous };
}
