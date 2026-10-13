/** The names on a fresh friend list that the previous list did not have. */
export function friendsAdded(
  before: readonly { name: string }[],
  after: readonly { name: string }[],
): string[] {
  const had = new Set(before.map(one => one.name));
  return after.filter(one => !had.has(one.name)).map(one => one.name);
}
