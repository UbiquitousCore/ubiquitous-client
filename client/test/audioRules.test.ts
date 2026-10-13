/**
 * The rules sounds play by: numbered files, reach, pitch, banks, the music
 * timetable and which zone's music is heard where.
 */

import { describe, expect, it } from 'vitest';

import type { SoundCue } from '../src/assets/formats/tables';
import type { ZoneInfo } from '../src/assets/types';
import {
  bankIsFull,
  cueFile,
  cueFiles,
  indexCatalogue,
  pickVariant,
  pitchFor,
  PITCH_SPREAD,
  FALLOFF,
  FULL_WITHIN,
  pannerFalloff,
  REACH,
  reachOf,
  variantPath,
  withExtension,
  withinEarshot,
} from '../src/audio/cues';
import { EASE_MS, GAP_MAX_MS, GAP_MIN_MS, MusicPlan } from '../src/audio/musicPlan';
import type { MusicCommand } from '../src/audio/musicPlan';
import { zoneSoundAt } from '../src/audio/zoneSound';

function cue(over: Partial<SoundCue> = {}): SoundCue {
  return {
    id: 1,
    path: 'sound/m_envir_forest_1.wav',
    variants: 1,
    music: false,
    positional: false,
    loop: false,
    pitched: false,
    volume: 1,
    reach: 0,
    bank: 0,
    ...over,
  };
}

describe('numbered files', () => {
  it('swaps the number after the last underscore', () => {
    expect(variantPath('sound/sfx_npc_wolf_hurt_1.wav', 3)).toBe('sound/sfx_npc_wolf_hurt_3.wav');
    expect(variantPath('sound/a_b.wav', 2)).toBe('sound/a_2.wav');
    expect(variantPath('sound/plain.wav', 2)).toBe('sound/plain.wav');
  });

  it('reads a name with no extension as a .wav', () => {
    expect(withExtension('sound/sfx_skill_bow_shoot')).toBe('sound/sfx_skill_bow_shoot.wav');
    expect(withExtension('sound/m_title.wav')).toBe('sound/m_title.wav');
    expect(variantPath('sound/sfx_npc_x_hurt_1', 2)).toBe('sound/sfx_npc_x_hurt_2.wav');
  });

  it('picks every variant evenly, and only real ones', () => {
    const seen = new Set<number>();
    for (let r = 0; r < 1; r += 0.01) seen.add(pickVariant(3, r));
    expect([...seen].sort()).toEqual([1, 2, 3]);
    expect(pickVariant(3, 0.9999)).toBe(3);
    expect(pickVariant(1, 0.7)).toBe(1);
  });

  it('chooses among the others only when told what to avoid', () => {
    for (let r = 0; r < 1; r += 0.05) expect(pickVariant(2, r, 1)).toBe(2);
    const seen = new Set<number>();
    for (let r = 0; r < 1; r += 0.01) seen.add(pickVariant(3, r, 2));
    expect([...seen].sort()).toEqual([1, 3]);
  });

  it('falls through to the siblings of a variant that is not shipped, one past the count too', () => {
    const files = cueFiles(cue({ path: 'sound/sfx_npc_x_idle_1.wav', variants: 2 }), 0);
    expect(files).toEqual([
      'sound/sfx_npc_x_idle_1.wav',
      'sound/sfx_npc_x_idle_2.wav',
      'sound/sfx_npc_x_idle_3.wav',
    ]);
    expect(cueFiles(cue({ path: 'sound/m_title.wav' }), 0.5)).toEqual(['sound/m_title.wav']);
    expect(cueFile(cue({ variants: 2 }), 0.9).path).toBe('sound/m_envir_forest_2.wav');
  });
});

describe('how a sound is heard', () => {
  it('varies the pitch of a sound marked to, within its spread', () => {
    expect(pitchFor(cue(), 0.3)).toBe(1);
    expect(pitchFor(cue({ pitched: true }), 0)).toBeCloseTo(1 - PITCH_SPREAD);
    expect(pitchFor(cue({ pitched: true }), 1)).toBeCloseTo(1 + PITCH_SPREAD);
  });

  it('carries as far as its row says, or the default', () => {
    expect(reachOf(cue())).toBe(REACH);
    expect(reachOf(cue({ reach: 60 }))).toBe(60);
  });

  it('quietens a sound steeply with distance, full only beside the hero', () => {
    const falloff = pannerFalloff(cue());
    expect(falloff).toEqual({
      distanceModel: 'exponential',
      refDistance: FULL_WITHIN,
      maxDistance: REACH,
      rolloffFactor: FALLOFF,
    });
    // Web Audio's exponential model: (distance / ref) ^ -rolloff, the distance
    // held between ref and max.
    const heard = (distance: number) =>
      (Math.min(Math.max(distance, falloff.refDistance), falloff.maxDistance) /
        falloff.refDistance) **
      -falloff.rolloffFactor;
    expect(heard(2)).toBe(1);
    expect(heard(5)).toBeCloseTo(0.46, 2);
    expect(heard(10)).toBeLessThan(0.2);
    expect(heard(20)).toBeLessThan(0.06);
    expect(pannerFalloff(cue({ reach: 60 })).maxDistance).toBe(60);
  });

  it('does not start a one-shot out of reach, but always starts a loop', () => {
    expect(withinEarshot(REACH - 1, cue())).toBe(true);
    expect(withinEarshot(REACH + 1, cue())).toBe(false);
    expect(withinEarshot(REACH + 1, cue({ reach: 60 }))).toBe(true);
    expect(withinEarshot(500, cue({ loop: true }))).toBe(true);
  });

  it('knows when a bank is full', () => {
    expect(bankIsFull(undefined, 99)).toBe(false);
    expect(bankIsFull({ id: 1, capacity: 2 }, 1)).toBe(false);
    expect(bankIsFull({ id: 1, capacity: 2 }, 2)).toBe(true);
    expect(bankIsFull({ id: 1, capacity: 0 }, 50)).toBe(false);
  });

  it('finds a sound by file name, the first row naming a file winning', () => {
    const index = indexCatalogue({
      cues: [
        cue({ id: 25, path: 'sound/sfx_mc_level_up.wav' }),
        cue({ id: 849, path: 'sound/SFX_MC_Level_Up.wav' }),
      ],
      banks: [],
      battleMusic: [[71, 744]],
    });
    expect(index.byName.get('sfx_mc_level_up')?.id).toBe(25);
    expect(index.battleMusic.get(71)).toBe(744);
  });
});

describe('the music timetable', () => {
  const starts = (commands: MusicCommand[]): string[] =>
    commands.filter(c => c.kind === 'start').map(c => (c as { path: string }).path);

  it('plays a piece once, eases it out, rests, then plays another piece', () => {
    const plan = new MusicPlan(() => 0);
    const music = cue({ id: 3, music: true, variants: 2 });
    expect(starts(plan.play(music))).toEqual(['sound/m_envir_forest_1.wav']);
    plan.setDuration('sound/m_envir_forest_1.wav', 60_000);

    expect(plan.tick(60_000 - EASE_MS - 1)).toEqual([]);
    expect(plan.tick(2)).toEqual([{ kind: 'fadeOut', fadeMs: EASE_MS }]);
    // The piece ends, and with a random draw of 0 the rest is the shortest.
    expect(plan.tick(EASE_MS)).toEqual([]);
    expect(plan.tick(GAP_MIN_MS - 1)).toEqual([]);
    expect(starts(plan.tick(2))).toEqual(['sound/m_envir_forest_2.wav']);
  });

  it('rests no longer than the longest gap', () => {
    const plan = new MusicPlan(() => 0.999_999);
    plan.play(cue({ id: 3, music: true, variants: 2 }));
    plan.setDuration('sound/m_envir_forest_2.wav', 10_000);
    plan.tick(10_001);
    expect(plan.tick(GAP_MAX_MS - 10)).toEqual([]);
    expect(starts(plan.tick(20))).toHaveLength(1);
  });

  it('does not time a piece before its file has loaded', () => {
    const plan = new MusicPlan(() => 0);
    plan.play(cue({ id: 3, music: true }));
    expect(plan.tick(10 * 60_000)).toEqual([]);
  });

  it('eases across at once to different music, and ignores the same music again', () => {
    const plan = new MusicPlan(() => 0);
    plan.play(cue({ id: 3, music: true }));
    expect(plan.play(cue({ id: 3, music: true }))).toEqual([]);
    expect(starts(plan.play(cue({ id: 4, path: 'sound/m_human_city.wav', music: true })))).toEqual([
      'sound/m_human_city.wav',
    ]);
    expect(plan.stop()).toEqual([{ kind: 'stop', fadeMs: EASE_MS }]);
    expect(plan.stop()).toEqual([]);
  });
});

describe('which zone is heard', () => {
  let id = 0;
  function zone(over: Partial<ZoneInfo>): ZoneInfo {
    return {
      id: ++id,
      name: '',
      mapId: 1,
      mapName: 'land',
      centre: [0, 0],
      bounds: [0, 0, 100, 100],
      hasScenery: true,
      parentId: -1,
      priority: 1,
      icon: '',
      friendly: 0,
      atmosphere: { fogColor: [0, 0, 0], fogNear: 0, fogFar: 0, skybox: null },
      sound: { music: 0, ambience: 0 },
      ...over,
    };
  }

  const region = zone({ id: 10, bounds: [0, 0, 1000, 1000], sound: { music: 543, ambience: 478 } });
  const town = zone({
    id: 11,
    parentId: 10,
    bounds: [100, 100, 200, 200],
    sound: { music: 548, ambience: 0 },
  });
  const market = zone({ id: 12, parentId: 11, bounds: [120, 120, 140, 140] });
  const farm = zone({ id: 13, parentId: 10, bounds: [300, 300, 400, 400] });
  const elsewhere = zone({
    id: 20,
    mapId: 2,
    bounds: [0, 0, 1000, 1000],
    sound: { music: 1, ambience: 1 },
  });
  const zones = [region, town, market, farm, elsewhere];

  it('plays the region out in the open', () => {
    expect(zoneSoundAt(zones, 1, 50, 50)).toEqual({ zoneId: 10, music: 543, ambience: 478 });
  });

  it('plays the innermost zone with music, looking outwards for what it lacks', () => {
    expect(zoneSoundAt(zones, 1, 150, 150)).toEqual({ zoneId: 11, music: 548, ambience: 478 });
    // The market has neither; its town has music, its region the ambience.
    expect(zoneSoundAt(zones, 1, 130, 130)).toEqual({ zoneId: 12, music: 548, ambience: 478 });
    expect(zoneSoundAt(zones, 1, 350, 350)).toEqual({ zoneId: 13, music: 543, ambience: 478 });
  });

  it('is silent outside every zone, and never hears another map', () => {
    expect(zoneSoundAt(zones, 1, -50, -50)).toBeNull();
    expect(zoneSoundAt(zones, 3, 50, 50)).toBeNull();
  });
});
