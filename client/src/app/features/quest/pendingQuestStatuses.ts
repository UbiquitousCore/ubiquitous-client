/** Pending quest-status rows whose target entities are now available. */
export function pendingQuestStatusesToClear(
  pending: ReadonlyMap<number, string>,
  applyStatus: (networkId: number, status: string) => boolean,
): number[] {
  const applied: number[] = [];
  for (const [networkId, status] of pending) {
    if (applyStatus(networkId, status)) applied.push(networkId);
  }
  return applied;
}
