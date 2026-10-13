/**
 * The stop the player is standing at right now, by the server's own test.
 */
export function departureStopNow(
  playerPosition: [number, number, number] | null,
  mapId: number | undefined,
  stopAt: (at: [number, number, number], mapId: number) => number | null,
): number | null {
  if (!playerPosition || mapId === undefined) return null;
  return stopAt(playerPosition, mapId);
}
