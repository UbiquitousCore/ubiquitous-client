/** Why the server refused a cast, in plain English, keyed by the reason it names. */

const MESSAGES: Record<string, string> = {
  unknownSpell: 'You do not know that spell.',
  noEffectData: 'That spell does nothing yet.',
  onCooldown: 'That spell is not ready yet.',
  notEnoughPower: 'You do not have enough power.',
  invalidTarget: 'You have no valid target.',
  incapacitated: 'You cannot do that right now.',
  silenced: 'You are silenced.',
  missingEquipment: 'You need the right weapon for that.',
  alreadyCasting: 'You are already casting.',
  outOfRange: 'Your target is too far away.',
};

/** A readable reason a cast was refused. */
export function spellErrorMessage(reason: string): string {
  return MESSAGES[reason] ?? `The spell could not be cast (${reason}).`;
}
