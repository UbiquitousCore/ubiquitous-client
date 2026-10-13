/**
 * How the hero answers a harmful blow from a living hostile. Observed in play
 * by the owner: with nothing picked, pick the attacker and swing. Own choice:
 * the same over a fallen pick; swing if it is already the pick; nothing if
 * someone else alive is picked. A running swing is never restarted, and a
 * cast is never broken into by one (the owner's call).
 */

/** What the hero has picked, seen from the body that struck them. */
export type PickSeen = 'none' | 'fallen' | 'attacker' | 'other';

export interface Struck {
  heroAlive: boolean;
  /** False for a heal. */
  harmful: boolean;
  attackerAlive: boolean;
  attackerHostile: boolean;
  target: PickSeen;
  /** An attack of the hero's is already running. */
  swinging: boolean;
  /** A cast of the hero's is filling its bar. */
  casting: boolean;
}

export interface StrikeReply {
  /** Make the attacker the hero's target. */
  pick: boolean;
  /** Start the hero's attack on the attacker. */
  swing: boolean;
}

const ANSWER: Readonly<Record<PickSeen, StrikeReply>> = {
  none: { pick: true, swing: true },
  fallen: { pick: true, swing: true },
  attacker: { pick: false, swing: true },
  other: { pick: false, swing: false },
};

const UNMOVED: StrikeReply = { pick: false, swing: false };

export function replyToBlow(blow: Struck): StrikeReply {
  const counts = blow.heroAlive && blow.harmful && blow.attackerAlive && blow.attackerHostile;
  if (!counts) return UNMOVED;
  const answer = ANSWER[blow.target];
  return { pick: answer.pick, swing: answer.swing && !blow.swinging && !blow.casting };
}
