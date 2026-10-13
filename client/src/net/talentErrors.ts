/** Why the server refused a talent point, in plain English, keyed by the reason it names. */

const MESSAGES: Record<string, string> = {
  unknownTalent: 'That talent does not exist.',
  wrongClass: 'That talent belongs to another class.',
  maxRank: 'That talent is already at its highest rank.',
  noPoints: 'You have no talent points to spend.',
  tierLocked: 'Spend more points in this tree first.',
  prerequisite: 'Fully learn the talent it follows first.',
};

/** A readable reason a talent point was not spent. */
export function talentErrorMessage(reason: string): string {
  return MESSAGES[reason] ?? `The talent could not be learned (${reason}).`;
}
