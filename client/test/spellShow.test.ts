/**
 * What each moment of a spell visual shows, against synthetic visuals.
 */
import { describe, expect, it } from 'vitest';

import { phaseFor, planFor, shotClip, spotFor } from '../src/gameplay/spellShow';
import type {
  SpellPhase,
  SpellPhaseData,
  SpellVisualData,
  SpellVisualEffect,
} from '../src/assets/formats/tables';

function effect(over: Partial<SpellVisualEffect> = {}): SpellVisualEffect {
  return {
    effectId: 1,
    name: 'a',
    pathname: 'a.beff',
    placement: 'ride',
    scale: 1,
    flight: 'straight',
    count: 1,
    anchor: 'rightHand',
    ...over,
  };
}

function phase(over: Partial<SpellPhaseData> = {}): SpellPhaseData {
  return {
    casterClipId: 0,
    casterClip: null,
    casterClipLoops: false,
    wholeBody: false,
    sound: 0,
    shake: 0,
    effects: [],
    ...over,
  };
}

function visual(
  phases: Partial<Record<SpellPhase, SpellPhaseData>>,
  over: Partial<SpellVisualData> = {},
): SpellVisualData {
  return {
    id: 1,
    phases: {
      opening: null,
      windUp: null,
      release: null,
      impact: null,
      lasting: null,
      area: null,
      ending: null,
      ...phases,
    },
    missile: null,
    weaponStreak: 0,
    impactDelayMs: 0,
    ...over,
  };
}

describe('which phase answers a moment', () => {
  it('releases with the release phase when there is one', () => {
    const v = visual({ opening: phase(), release: phase() });
    expect(phaseFor(v, 'release', true)).toBe('release');
  });

  it('swings an instant spell with no release row through its opening', () => {
    const v = visual({ opening: phase() });
    expect(phaseFor(v, 'release', true)).toBe('opening');
    // A spell with a cast bar has already shown its wind-up.
    expect(phaseFor(v, 'release', false)).toBeNull();
  });

  it('answers the other moments with the phase of the same name', () => {
    const v = visual({ impact: phase(), lasting: phase() });
    expect(phaseFor(v, 'impact', false)).toBe('impact');
    expect(phaseFor(v, 'lasting', false)).toBe('lasting');
    expect(phaseFor(v, 'area', false)).toBeNull();
  });
});

describe('where a particle goes', () => {
  it('rides the node of its anchor', () => {
    expect(spotFor(effect({ anchor: 'overhead' }))).toEqual({
      kind: 'ride',
      node: 'Dummy_Head_Effect-node',
    });
    expect(spotFor(effect({ anchor: 'leftHand' }))).toEqual({
      kind: 'ride',
      node: 'Dummy_L_Hand-node',
    });
  });

  it('rides the chest when it rides the body, whatever its anchor', () => {
    expect(spotFor(effect({ placement: 'rideBody', anchor: 'overhead' }))).toEqual({
      kind: 'ride',
      node: 'Bip01_Spine',
    });
  });

  it('bursts on the near side of its node, and drops at it', () => {
    expect(spotFor(effect({ placement: 'burst', anchor: 'chest' }))).toEqual({
      kind: 'front',
      node: 'Bip01_Spine',
    });
    expect(spotFor(effect({ placement: 'drop', anchor: 'rightHand' }))).toEqual({
      kind: 'node',
      node: 'Dummy_R_Hand-node',
    });
  });

  it('goes on the ground or at the aimed point when its anchor has no node', () => {
    for (const placement of ['ride', 'burst', 'drop'] as const) {
      expect(spotFor(effect({ placement, anchor: 'feet' }))).toEqual({ kind: 'feet' });
      expect(spotFor(effect({ placement, anchor: 'area' }))).toEqual({ kind: 'area' });
    }
  });
});

describe('what a moment shows', () => {
  const cast = visual(
    {
      windUp: phase({ casterClip: 'gather', effects: [effect({ pathname: 'glow.beff' })] }),
      release: phase({ casterClip: 'throw', wholeBody: true }),
      impact: phase({
        effects: [effect({ pathname: 'pow.beff', placement: 'burst', anchor: 'chest' })],
      }),
      lasting: phase({ effects: [effect({ pathname: 'shield.beff', anchor: 'chest' })] }),
    },
    { weaponStreak: 5, impactDelayMs: 300 },
  );

  it('loops the wind-up clip and holds it', () => {
    const plan = planFor(cast, 'windUp', false)!;
    expect(plan.clip).toEqual({ name: 'gather', loop: true, wholeBody: false });
    expect(plan.lasts).toBe('held');
    expect(plan.streak).toBe(0);
    expect(plan.particles.map(p => p.path)).toEqual(['glow.beff']);
  });

  it('plays the release once, ends the wind-up and streaks the weapon', () => {
    const plan = planFor(cast, 'release', false)!;
    expect(plan.clip).toEqual({ name: 'throw', loop: false, wholeBody: true });
    expect(plan.endsWindUp).toBe(true);
    expect(plan.streak).toBe(5);
    expect(plan.lasts).toBe('spent');
  });

  it('still ends the wind-up when there is no release to show', () => {
    const plan = planFor(visual({ windUp: phase() }), 'release', false)!;
    expect(plan.phase).toBeNull();
    expect(plan.endsWindUp).toBe(true);
    expect(plan.particles).toEqual([]);
  });

  it('waits out the swing before a melee impact, but not a projectile one', () => {
    expect(planFor(cast, 'impact', false)!.waitMs).toBe(300);
    const shot = { ...cast, missile: effect({ anchor: null }) };
    expect(planFor(shot, 'impact', false)!.waitMs).toBe(0);
  });

  it('holds a lasting effect and lets an impact burn out', () => {
    expect(planFor(cast, 'lasting', false)!.lasts).toBe('held');
    expect(planFor(cast, 'impact', false)!.lasts).toBe('spent');
  });

  it('has nothing to show for a moment the visual has no phase for', () => {
    expect(planFor(cast, 'area', false)).toBeNull();
  });
});

describe('the clip a ranged shot plays', () => {
  it('takes the release clip first, then the wind-up, then the opening', () => {
    expect(
      shotClip(visual({ opening: phase({ casterClip: 'o' }), windUp: phase({ casterClip: 'w' }) })),
    ).toBe('w');
    expect(
      shotClip(
        visual({ opening: phase({ casterClip: 'o' }), release: phase({ casterClip: 'r' }) }),
      ),
    ).toBe('r');
    expect(shotClip(visual({}))).toBeNull();
  });
});
