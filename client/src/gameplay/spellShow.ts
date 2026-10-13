/** What a spell visual shows on a body per moment, as data; `CombatVisuals` carries it out. */
import type {
  EffectAnchor,
  SpellPhase,
  SpellPhaseData,
  SpellVisualData,
  SpellVisualEffect,
} from '../assets/formats/tables';

/**
 * The moments of a cast the client knows about. A moment is what happened;
 * the phase is which of the visual's rows answers it.
 */
export type CastMoment = 'windUp' | 'release' | 'impact' | 'lasting' | 'area';

/** The model node each body anchor hangs off, observed in play by the owner. Feet and area have none. */
const ANCHOR_NODES: Record<EffectAnchor, string | null> = {
  overhead: 'Dummy_Head_Effect-node',
  chest: 'Bip01_Spine',
  feet: null,
  rightHand: 'Dummy_R_Hand-node',
  leftHand: 'Dummy_L_Hand-node',
  area: null,
};

/** A particle that rides the body turns and moves with its chest. */
const BODY_NODE = 'Bip01_Spine';

/** `ride` follows a node; the rest are placed once: `front` (camera side), `node`, `feet`, `area` (the aim point). */
export type ParticleSpot =
  | { kind: 'ride'; node: string }
  | { kind: 'front'; node: string }
  | { kind: 'node'; node: string }
  | { kind: 'feet' }
  | { kind: 'area' };

export interface ParticlePlan {
  path: string;
  /** Before the body's own size is taken into account. */
  scale: number;
  spot: ParticleSpot;
}

/** Everything one moment of a visual puts on a body. */
export interface ShowPlan {
  phase: SpellPhase | null;
  /** The clip to play, or null to leave the body's clip alone. */
  clip: { name: string; loop: boolean; wholeBody: boolean } | null;
  /** Whether a wind-up loop left on the body should stop. */
  endsWindUp: boolean;
  particles: ParticlePlan[];
  /** The blade streak to start, 0 for none. */
  streak: number;
  /** How long the particles wait before they start, in milliseconds. */
  waitMs: number;
  /**
   * `spent` ends the show once its particles burn out. `held` keeps it until
   * something else ends it: the cast for a wind-up, the aura for a lasting
   * effect.
   */
  lasts: 'spent' | 'held';
}

/** Where one particle file sits, from its anchor and how it is placed. */
export function spotFor(effect: SpellVisualEffect): ParticleSpot {
  const node = effect.anchor ? ANCHOR_NODES[effect.anchor] : null;
  switch (effect.placement) {
    case 'ride':
      if (node) return { kind: 'ride', node };
      break;
    case 'rideBody':
      return { kind: 'ride', node: BODY_NODE };
    case 'burst':
      if (node) return { kind: 'front', node };
      break;
    case 'drop':
      if (node) return { kind: 'node', node };
      break;
  }
  return effect.anchor === 'area' ? { kind: 'area' } : { kind: 'feet' };
}

/** The phase answering a moment; an instant spell without a release row shows its opening (observed in play by the owner). */
export function phaseFor(
  visual: SpellVisualData,
  moment: CastMoment,
  instant: boolean,
): SpellPhase | null {
  const has = (phase: SpellPhase) => visual.phases[phase] !== null;
  switch (moment) {
    case 'release':
      if (has('release')) return 'release';
      return instant && has('opening') ? 'opening' : null;
    case 'windUp':
    case 'impact':
    case 'lasting':
    case 'area':
      return has(moment) ? moment : null;
  }
}

/** What one moment shows, or null; a release always ends the wind-up, even with no phase. */
export function planFor(
  visual: SpellVisualData,
  moment: CastMoment,
  instant: boolean,
): ShowPlan | null {
  const phase = phaseFor(visual, moment, instant);
  if (phase === null && moment !== 'release') return null;
  const data: SpellPhaseData | null = phase ? visual.phases[phase] : null;
  const loop = moment === 'windUp';
  return {
    phase,
    clip: data?.casterClip ? { name: data.casterClip, loop, wholeBody: data.wholeBody } : null,
    endsWindUp: moment === 'release',
    particles: (data?.effects ?? []).map(effect => ({
      path: effect.pathname,
      scale: effect.scale,
      spot: spotFor(effect),
    })),
    streak: moment === 'release' ? visual.weaponStreak : 0,
    // A melee blow lands a beat after the swing starts. A projectile's
    // flight is its own wait, so an impact it carries plays on arrival.
    waitMs: moment === 'impact' && !visual.missile ? visual.impactDelayMs : 0,
    lasts: moment === 'windUp' || moment === 'lasting' ? 'held' : 'spent',
  };
}

/**
 * The clip a ranged shot plays: the first of release, wind-up and opening
 * that names one (observed in play by the owner).
 */
export function shotClip(visual: SpellVisualData): string | null {
  for (const phase of ['release', 'windUp', 'opening'] as const) {
    const clip = visual.phases[phase]?.casterClip;
    if (clip) return clip;
  }
  return null;
}
