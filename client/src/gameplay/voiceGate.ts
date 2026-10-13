/** Own choice: each kind of line has a chance and a per-body quiet spell; dying, jumping and greeting are unlimited. */

import type { UnitSoundState } from '../assets/formats/tables';

export interface VoiceRule {
  /** The share of chances taken, 0 to 1. */
  chance: number;
  /** Seconds before the same body says the same kind of line again. */
  quietS: number;
}

export const VOICE_RULES: Partial<Record<UnitSoundState, VoiceRule>> = {
  attack: { chance: 0.3, quietS: 4 },
  hurt: { chance: 0.6, quietS: 2.5 },
  aggro: { chance: 1, quietS: 8 },
  idle: { chance: 0.25, quietS: 10 },
};

export class VoiceGate {
  /** When each body last said each kind of line, in seconds on the caller's clock. */
  private readonly lastSaid = new Map<number, Map<UnitSoundState, number>>();

  constructor(private readonly random: () => number = Math.random) {}

  /**
   * Should this body say this kind of line, now at `nowS`? A body that is
   * `sure` skips the chance and keeps only the quiet spell: the hero's own
   * voice should answer every time it has not just spoken.
   */
  allows(networkId: number, state: UnitSoundState, nowS: number, sure = false): boolean {
    const rule = VOICE_RULES[state];
    if (!rule) return true;
    const said = this.lastSaid.get(networkId);
    const last = said?.get(state);
    if (last !== undefined && nowS - last < rule.quietS) return false;
    if (!sure && this.random() >= rule.chance) return false;
    if (said) said.set(state, nowS);
    else this.lastSaid.set(networkId, new Map([[state, nowS]]));
    return true;
  }

  /** Forget a body that has gone. */
  forget(networkId: number): void {
    this.lastSaid.delete(networkId);
  }
}
