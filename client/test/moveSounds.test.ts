import { describe, expect, it } from 'vitest';

import { MoveSounds, STRIDE_S, passes } from '../src/gameplay/moveSounds';
import type { MoveFacts, SoundChoice } from '../src/gameplay/moveSounds';

function facts(over: Partial<MoveFacts> = {}): MoveFacts {
  return {
    locomotion: 'ground',
    moving: false,
    backward: false,
    jumped: false,
    landed: false,
    wading: false,
    surface: 'ground',
    underwater: false,
    mount: null,
    ...over,
  };
}

/** Run `seconds` of frames and collect every sound named. */
function run(sounds: MoveSounds, f: MoveFacts, seconds: number, dt = 1 / 60): SoundChoice[] {
  const heard: SoundChoice[] = [];
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) heard.push(...sounds.step(f, dt).sounds);
  return heard;
}

describe('MoveSounds', () => {
  it('steps at once when a run starts, then once a stride', () => {
    const heard = run(new MoveSounds(), facts({ moving: true }), 1);
    expect(heard[0]).toEqual(['sfx_mc_footstep_ground_1']);
    expect(heard).toHaveLength(1 + Math.floor(1 / STRIDE_S.run));
  });

  it('steps backwards at the slower stride', () => {
    const heard = run(new MoveSounds(), facts({ moving: true, backward: true }), 1);
    expect(heard).toHaveLength(1 + Math.floor(1 / STRIDE_S.walk));
  });

  it('is silent standing still, and starts afresh after', () => {
    const s = new MoveSounds();
    run(s, facts({ moving: true }), 0.2);
    expect(run(s, facts(), 2)).toEqual([]);
    expect(s.step(facts({ moving: true }), 1 / 60).sounds).toEqual([['sfx_mc_footstep_ground_1']]);
  });

  it('does not make up for a long frame with a burst of steps', () => {
    const s = new MoveSounds();
    s.step(facts({ moving: true }), 1 / 60);
    expect(s.step(facts({ moving: true }), 5).sounds).toHaveLength(1);
    expect(s.step(facts({ moving: true }), 1 / 60).sounds).toHaveLength(0);
  });

  it('splashes when wading, steps on wood on wood, and a mount steps with its own feet', () => {
    expect(run(new MoveSounds(), facts({ moving: true, wading: true }), 0.1)).toEqual([
      ['sfx_mc_footstep_water_1'],
    ]);
    expect(run(new MoveSounds(), facts({ moving: true, surface: 'wood' }), 0.1)).toEqual([
      ['sfx_mc_footstep_wood_1'],
    ]);
    expect(run(new MoveSounds(), facts({ moving: true, mount: 'sfx_hoof_' }), 0.1)).toEqual([
      ['sfx_hoof_footstep_ground_1', 'sfx_hoof_footstep_ground_1'],
    ]);
    expect(
      run(new MoveSounds(), facts({ moving: true, backward: true, mount: 'sfx_pad_' }), 0.1),
    ).toEqual([['sfx_pad_footsteps_slow_ground_1', 'sfx_pad_footstep_ground_1']]);
  });

  it('strokes while swimming, differently under the surface', () => {
    const heard = run(new MoveSounds(), facts({ locomotion: 'swim', moving: true }), 2);
    expect(heard).toEqual(Array(1 + Math.floor(2 / STRIDE_S.swim)).fill(['sfx_mc_swim_1']));
    expect(
      run(new MoveSounds(), facts({ locomotion: 'swim', moving: true, underwater: true }), 0.1),
    ).toEqual([['sfx_mc_swim_underwater_1']]);
  });

  it('takes no steps in the air, voices the jump on foot, and lands on what is there', () => {
    const s = new MoveSounds();
    expect(s.step(facts({ jumped: true, locomotion: 'air', moving: true }), 1 / 60)).toEqual({
      sounds: [],
      jumpVoice: true,
    });
    expect(run(s, facts({ locomotion: 'air', moving: true }), 0.5)).toEqual([]);
    expect(s.step(facts({ landed: true }), 1 / 60).sounds).toEqual([['sfx_mc_jump_land_ground_1']]);
    expect(new MoveSounds().step(facts({ landed: true, surface: 'wood' }), 1 / 60).sounds).toEqual([
      ['sfx_mc_jump_land_wood_1'],
    ]);
    expect(new MoveSounds().step(facts({ landed: true, wading: true }), 1 / 60).sounds).toEqual([
      ['sfx_mc_enter_water'],
    ]);
    expect(
      new MoveSounds().step(facts({ jumped: true, mount: 'sfx_hoof_', locomotion: 'air' }), 1 / 60)
        .jumpVoice,
    ).toBe(false);
  });

  it('splashes falling into deep water, a mount by either of its water landings', () => {
    const s = new MoveSounds();
    s.step(facts({ locomotion: 'air' }), 1 / 60);
    expect(s.step(facts({ locomotion: 'swim' }), 1 / 60).sounds).toEqual([['sfx_mc_enter_water']]);
    const m = new MoveSounds();
    expect(m.step(facts({ landed: true, wading: true, mount: 'sfx_pad_' }), 1 / 60).sounds).toEqual(
      [['sfx_pad_jump_land_water_1', 'sfx_pad_jump_land_swamp_1']],
    );
  });
});

describe('footsteps that follow the clip', () => {
  /** Frames of a run whose clip lasts `cycle` seconds, feet down at `footfalls`. */
  function following(
    cycle: number,
    footfalls: number[],
    seconds: number,
    over: Partial<MoveFacts> = {},
  ) {
    const sounds = new MoveSounds();
    const dt = 1 / 60;
    const at: number[] = [];
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      const phase = ((i * dt) / cycle) % 1;
      const heard = sounds.step(facts({ moving: true, stride: { phase, footfalls }, ...over }), dt);
      if (heard.sounds.length) at.push(i * dt);
    }
    return at;
  }

  it('steps as each foot comes down in the clip, however long the clip is', () => {
    // A 0.8 s run, feet down 0.3 and 0.8 of the way through: 0.24 s, 0.64 s,
    // 1.04 s, 1.44 s and 1.84 s, to the nearest frame.
    const at = following(0.8, [0.3, 0.8], 2);
    expect(at).toHaveLength(5);
    expect(at[0]).toBeCloseTo(0.24, 1);
    expect(at[1]! - at[0]!).toBeCloseTo(0.4, 1);
    expect(at[2]! - at[1]!).toBeCloseTo(0.4, 1);
  });

  it('keeps its own timer on a mount, whose feet are the mount’s', () => {
    const at = following(0.8, [0.3, 0.8], 1, { mount: 'sfx_hoof_' });
    expect(at[0]).toBe(0);
    expect(at).toHaveLength(1 + Math.floor(1 / STRIDE_S.run));
  });
});

describe('passes', () => {
  it('passes a footfall between two phases, and one across the loop', () => {
    expect(passes(0.2, 0.35, [0.3, 0.8])).toBe(true);
    expect(passes(0.35, 0.5, [0.3, 0.8])).toBe(false);
    expect(passes(0.9, 0.1, [0.05, 0.5])).toBe(true);
    expect(passes(0.9, 0.1, [0.3, 0.8])).toBe(false);
  });
});
