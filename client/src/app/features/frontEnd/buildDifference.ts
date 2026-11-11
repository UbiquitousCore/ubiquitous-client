/** What to tell a player whose game file is not the build the server's data came from. */

/** How many differing tables are named before the rest are only counted. Own choice. */
const NAMED = 3;

export function buildDifferenceLine(
  serverVersion: string | null,
  differingTables: readonly string[],
): string | null {
  if (differingTables.length === 0) return null;
  const named = differingTables.slice(0, NAMED).join(', ');
  const more = differingTables.length - NAMED;
  const which = more > 0 ? `${named} and ${more} more` : named;
  const server = serverVersion ? `game version ${serverVersion}` : 'another game version';
  return (
    `This server runs ${server}; your game file differs from it in ${which}. ` +
    'Some things may be missing or wrong.'
  );
}
