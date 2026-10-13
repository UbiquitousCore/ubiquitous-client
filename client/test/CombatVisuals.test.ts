/**
 * Combat visuals: an impact belongs to the target and plays when the
 * projectile arrives; plus phase selection, missile count, attachment and
 * aura bookkeeping.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  auraRemovalVisual,
  castVisualId,
  CombatVisuals,
  scaleForHeight,
  TRAIL_LINGER_MAX_MS,
} from '../src/gameplay/CombatVisuals';
import type {
  VisualBodies,
  VisualScene,
  VisualSounds,
  VisualTables,
} from '../src/gameplay/CombatVisuals';
import type {
  MissileFlight,
  SpellPhase,
  SpellPhaseData,
  SpellVisualData,
  SpellVisualEffect,
} from '../src/assets/formats/tables';
import type { EffectInstance } from '../src/renderer/EffectFactory';
import * as THREE from 'three';
import { LOOT_GLOW_EFFECT } from '../src/gameplay/loot';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A stand-in for a live particle system. `finished` is what drives cleanup. */
interface FakeInstance {
  id: number;
  finished: boolean;
  paused: boolean;
  /** Told to stop emitting and let its particles live out their lives. */
  woundDown: boolean;
  /** Spawned as a projectile, so its trail stays in the world. */
  inFlight: boolean;
  /** A projectile that arrived: gone, with its trail left fading. */
  landed: boolean;
  pos: [number, number, number];
  path: string;
  /** The skeleton node it hung off, or null when it was placed in the world. */
  node: string | null;
  scale: number;
}

let nextInstanceId = 0;

function effect(over: Partial<SpellVisualEffect> = {}): SpellVisualEffect {
  return {
    effectId: 1,
    name: 'test.beff',
    pathname: 'Effects/test.beff',
    placement: 'ride',
    scale: 1,
    flight: 'straight',
    count: 1,
    anchor: 'rightHand',
    ...over,
  };
}

function state(over: Partial<SpellPhaseData> = {}): SpellPhaseData {
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

/** A visual with only the phases named filled in, as the tables have it. */
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

interface Harness {
  combat: CombatVisuals;
  scene: VisualScene;
  bodies: VisualBodies;
  /** Every instance ever created, in creation order. */
  instances: FakeInstance[];
  live(): FakeInstance[];
  clips: Array<{ networkId: number; clip: string; hold: boolean; allBody: boolean }>;
  stops: number[];
  stripes: Array<{ entityId: number; index: number }>;
  /** Where each body is; absent means it is not in the world. */
  positions: Map<number, [number, number, number]>;
  /** Every sound started, in order. Cue ids of 100 and up loop. */
  heard: Array<{ cue: number; unit: number; stopped: boolean }>;
}

function harness(
  visuals: Record<number, SpellVisualData>,
  glowVisual: number | null = null,
): Harness {
  const instances: FakeInstance[] = [];
  const removed = new Set<number>();
  const clips: Array<{ networkId: number; clip: string; hold: boolean; allBody: boolean }> = [];
  const stops: number[] = [];
  const stripes: Array<{ entityId: number; index: number }> = [];
  const heard: Harness['heard'] = [];
  const sounds: VisualSounds = {
    playAt(cue, unit) {
      const entry = { cue, unit, stopped: false };
      heard.push(entry);
      return {
        loop: cue >= 100,
        stop() {
          entry.stopped = true;
        },
      };
    },
  };
  const positions = new Map<number, [number, number, number]>([
    [1, [0, 0, 0]],
    [2, [30, 0, 0]],
    [3, [0, 0, 30]],
  ]);

  const make = (
    path: string,
    pos: [number, number, number],
    node: string | null,
    scale: number,
    inFlight = false,
  ): EffectInstance => {
    const instance: FakeInstance = {
      id: nextInstanceId++,
      finished: false,
      paused: false,
      woundDown: false,
      inFlight,
      landed: false,
      pos: [...pos] as [number, number, number],
      path,
      node,
      scale,
    };
    instances.push(instance);
    return instance as unknown as EffectInstance;
  };

  const tables: VisualTables = {
    async spellVisual(id) {
      return visuals[id] ?? null;
    },
    async visualWithEffect(path) {
      return path === LOOT_GLOW_EFFECT ? glowVisual : null;
    },
  };

  const scene: VisualScene = {
    async spawnTempEffect(path, pos, scale = 1, _hideModels = false, inFlight = false) {
      return make(path, pos, null, scale, inFlight);
    },
    async attachEffectToEntity(_entityId, path, nodeId, scale = 1) {
      return make(path, [0, 0, 0], nodeId, scale);
    },
    moveTempEffect(instance, pos) {
      (instance as unknown as FakeInstance).pos = [...pos] as [number, number, number];
    },
    setEffectPaused(instance, paused) {
      (instance as unknown as FakeInstance).paused = paused;
    },
    windDownEffect(instance) {
      (instance as unknown as FakeInstance).woundDown = true;
    },
    landEffect(instance) {
      (instance as unknown as FakeInstance).landed = true;
    },
    removeTempEffect(instance) {
      removed.add((instance as unknown as FakeInstance).id);
    },
    spawnWeaponStripe(entityId, index) {
      stripes.push({ entityId, index });
    },
    entityNodePosition(entityId, nodeId) {
      const at = positions.get(entityId);
      if (!at) return null;
      if (nodeId === 'Bip01_R_Hand') return [at[0], at[1] + 1.4, at[2] + 0.3];
      if (nodeId === 'Bip01_Spine') return [at[0], at[1] + 1.2, at[2]];
      return null;
    },
    entityBounds() {
      return { size: new THREE.Vector3(0.7, 1.9, 0.5), centreY: 0.95 };
    },
    // Straight above the world origin, so a hit nudged toward the camera moves
    // in +Y and its horizontal place is still the body it struck.
    cameraPosition(): [number, number, number] {
      return [0, 100, 0];
    },
  };

  const bodies: VisualBodies = {
    localIdOf: networkId => (positions.has(networkId) ? networkId : undefined),
    worldPosition: networkId => positions.get(networkId) ?? null,
    playClip: (networkId, clip, options) => {
      clips.push({ networkId, clip, hold: options.hold, allBody: options.allBody });
    },
    stopClip: networkId => {
      stops.push(networkId);
    },
  };

  return {
    combat: new CombatVisuals(tables, scene, bodies, sounds),
    scene,
    bodies,
    instances,
    clips,
    stops,
    stripes,
    positions,
    heard,
    live: () => instances.filter(i => !removed.has(i.id)),
  };
}

/** Run the manager forward, one frame at a time, letting promises settle. */
async function advance(h: Harness, seconds: number, step = 1 / 60): Promise<void> {
  for (let t = 0; t < seconds; t += step) {
    h.combat.update(step);
    await Promise.resolve();
  }
}

beforeEach(() => {
  nextInstanceId = 0;
});

// ---------------------------------------------------------------------------

describe('scaleForHeight', () => {
  it('leaves anything person-sized alone', () => {
    for (const height of [0, 0.5, 1.2, 1.8]) expect(scaleForHeight(height)).toBe(1);
  });

  it('grows with the body and levels off for a giant', () => {
    expect(scaleForHeight(4)).toBeGreaterThan(1.2);
    expect(scaleForHeight(12)).toBe(scaleForHeight(30));
    expect(scaleForHeight(30)).toBeGreaterThan(2);
    expect(scaleForHeight(30)).toBeLessThan(3);
  });

  it('never shrinks as the body grows, and never jumps', () => {
    let last = scaleForHeight(0);
    for (let h = 0.01; h <= 12; h += 0.01) {
      const next = scaleForHeight(h);
      expect(next).toBeGreaterThanOrEqual(last);
      expect(next - last).toBeLessThan(0.01);
      last = next;
    }
  });
});

describe('a cast with a projectile', () => {
  const fireball = (): Record<number, SpellVisualData> => ({
    1: visual(
      {
        windUp: state({
          casterClipId: 110,
          casterClip: 'magic_directed_gather',
          casterClipLoops: true,
          effects: [effect({ effectId: 1, pathname: 'inhand.beff' })],
        }),
        release: state({
          casterClipId: 112,
          casterClip: 'magic_directed_release',
        }),
        impact: state({
          effects: [
            effect({
              effectId: 3,
              pathname: 'pow.beff',
              placement: 'burst',
              anchor: 'feet',
            }),
          ],
        }),
      },
      {
        missile: effect({
          effectId: 2,
          pathname: 'shoot.beff',
          anchor: null,
        }),
        impactDelayMs: 100,
      },
    ),
  });

  it('holds the impact until the projectile lands on the target', async () => {
    const h = harness(fireball());

    h.combat.beginCast(1, 1);
    await advance(h, 0.1);
    await h.combat.release(1, 1, 2000, 30, [2]);
    await advance(h, 0.1);

    // The shot is in the air and nothing has exploded on anybody yet.
    expect(h.live().some(i => i.path === 'shoot.beff')).toBe(true);
    expect(h.live().some(i => i.path === 'pow.beff')).toBe(false);

    // 30 units away at 30 units a second, plus the launch delay.
    await advance(h, 1.5);

    const pow = h.live().filter(i => i.path === 'pow.beff');
    expect(pow).toHaveLength(1);
    // On the ground under the TARGET, thirty units away — not on the caster.
    expect(pow[0]!.pos[0]).toBeCloseTo(30, 5);
    // And the projectile has landed once it has arrived.
    expect(h.instances.find(i => i.path === 'shoot.beff')?.landed).toBe(true);
  });

  it('plays the impact on the target at once when the spell gives the projectile no speed', async () => {
    const h = harness(fireball());

    await h.combat.release(1, 1, 2000, 0, [2]);
    await advance(h, 0.05);

    expect(h.live().some(i => i.path === 'shoot.beff')).toBe(false);
    const pow = h.live().filter(i => i.path === 'pow.beff');
    expect(pow).toHaveLength(1);
    expect(pow[0]!.pos[0]).toBeCloseTo(30, 5);
  });

  it('flies one projectile per target struck', async () => {
    const h = harness(fireball());

    await h.combat.release(1, 1, 2000, 30, [2, 3]);
    await advance(h, 0.2);

    expect(h.live().filter(i => i.path === 'shoot.beff')).toHaveLength(2);
  });

  it('flies the whole volley a multi-missile visual asks for', async () => {
    const visuals = fireball();
    visuals[1]!.missile!.count = 3;
    const h = harness(visuals);

    await h.combat.release(1, 1, 2000, 30, [2]);
    await advance(h, 0.2);

    expect(h.live().filter(i => i.path === 'shoot.beff')).toHaveLength(3);
  });

  it('keeps the shot out of sight until it is actually launched', async () => {
    const h = harness(fireball());

    await h.combat.release(1, 1, 2000, 30, [2]);
    // One frame in: created, but still held in the hand.
    await advance(h, 1 / 60, 1 / 60);
    const shot = h.instances.find(i => i.path === 'shoot.beff');
    expect(shot?.paused).toBe(true);

    await advance(h, 0.3);
    expect(shot?.paused).toBe(false);
  });

  it('removes the caster release effect when its missile launches', async () => {
    const visuals = fireball();
    visuals[1]!.phases.release = state({
      effects: [effect({ pathname: 'release.beff' })],
    });
    const h = harness(visuals);

    await h.combat.release(1, 1, 2000, 30, [2]);
    await advance(h, 0.05);
    expect(h.live().some(i => i.path === 'release.beff')).toBe(true);

    await advance(h, 0.2);
    expect(h.live().some(i => i.path === 'release.beff')).toBe(false);
    expect(h.live().some(i => i.path === 'shoot.beff')).toBe(true);
  });

  it('strikes a tall body high on its chest, about three quarters of the way up', async () => {
    const h = harness(fireball());
    // A body 2 units tall standing on the ground: its box runs 0 to 2.
    h.scene.entityBounds = () => ({ size: new THREE.Vector3(0.6, 2, 0.4), centreY: 1 });

    await h.combat.release(1, 1, 2000, 30, [2]);
    await advance(h, 1.5);

    const shot = h.instances.find(i => i.path === 'shoot.beff')!;
    expect(shot.landed).toBe(true);
    expect(shot.pos[1]).toBeCloseTo(1.4, 5);
  });

  it('strikes a body wider than it is tall in the middle of its box', async () => {
    const h = harness(fireball());
    h.scene.entityBounds = () => ({ size: new THREE.Vector3(3, 1.2, 2), centreY: 0.6 });

    await h.combat.release(1, 1, 2000, 30, [2]);
    await advance(h, 1.5);

    expect(h.instances.find(i => i.path === 'shoot.beff')!.pos[1]).toBeCloseTo(0.6, 5);
  });

  it('gives up on a projectile whose target leaves the world', async () => {
    const h = harness(fireball());

    await h.combat.release(1, 1, 2000, 5, [2]);
    await advance(h, 0.2);
    h.positions.delete(2);
    await advance(h, 0.2);

    // No projectile still flying at a body that is not there, and no impact
    // played on it either.
    expect(
      h
        .live()
        .filter(i => i.path === 'shoot.beff')
        .every(i => i.landed),
    ).toBe(true);
    expect(h.live().some(i => i.path === 'pow.beff')).toBe(false);
  });

  it('plays the wind-up on the caster and holds it', async () => {
    const h = harness(fireball());

    h.combat.beginCast(1, 1);
    await advance(h, 0.05);

    // A chant loops for as long as the cast lasts; the release does not.
    expect(h.clips[0]).toEqual({
      networkId: 1,
      clip: 'magic_directed_gather',
      hold: true,
      allBody: false,
    });
    // And it hangs off the hand, not the ground.
    const inhand = h.instances.find(i => i.path === 'inhand.beff');
    expect(inhand?.node).toBe('Dummy_R_Hand-node');

    await h.combat.release(1, 1, 2000, 30, [2]);
    await advance(h, 0.05);
    expect(h.clips.at(-1)).toEqual({
      networkId: 1,
      clip: 'magic_directed_release',
      hold: false,
      allBody: false,
    });
  });
});

describe('the trail a projectile leaves', () => {
  const bolt = (): Record<number, SpellVisualData> => ({
    1: visual(
      {
        release: state({ effects: [effect({ pathname: 'release.beff' })] }),
        impact: state({
          effects: [effect({ pathname: 'pow.beff', placement: 'burst', anchor: 'feet' })],
        }),
      },
      { missile: effect({ effectId: 2, pathname: 'shoot.beff', anchor: null }) },
    ),
  });
  const shot = (h: Harness) => h.instances.find(i => i.path === 'shoot.beff')!;

  it('flies the projectile, and only the projectile, as an effect in flight', async () => {
    const h = harness(bolt());
    await h.combat.release(1, 1, 2000, 30, [2]);
    await advance(h, 0.1);

    expect(shot(h).inFlight).toBe(true);
    expect(h.instances.filter(i => i.path !== 'shoot.beff').every(i => !i.inFlight)).toBe(true);
  });

  it('flies a ranged weapon shot in flight too', async () => {
    const h = harness(bolt());
    await h.combat.rangeLaunch(1, 2, 1, 30);
    await advance(h, 0.05);
    expect(shot(h).inFlight).toBe(true);
  });

  it('leaves the trail in the scene on arrival until it has burnt out', async () => {
    const h = harness(bolt());
    await h.combat.release(1, 1, 2000, 30, [2]);
    await advance(h, 1.5);

    expect(shot(h).landed).toBe(true);
    expect(h.live()).toContain(shot(h));

    shot(h).finished = true;
    await advance(h, 1 / 60, 1 / 60);
    expect(h.live()).not.toContain(shot(h));
  });

  it('removes a trail whose particles never retire once it has lingered its longest', async () => {
    const h = harness(bolt());
    await h.combat.release(1, 1, 2000, 30, [2]);
    await advance(h, 1.5);
    expect(h.live()).toContain(shot(h));

    await advance(h, TRAIL_LINGER_MAX_MS / 1000 + 0.1);
    expect(h.live()).not.toContain(shot(h));
  });

  it('clears a fading trail with everything else', async () => {
    const h = harness(bolt());
    await h.combat.release(1, 1, 2000, 30, [2]);
    await advance(h, 1.5);
    h.combat.clear();
    expect(h.live()).not.toContain(shot(h));
  });
});

describe('a draining missile', () => {
  const drain = (flight: MissileFlight): Record<number, SpellVisualData> => ({
    1: visual(
      {
        impact: state({
          effects: [
            effect({
              effectId: 3,
              pathname: 'pow.beff',
              placement: 'burst',
              anchor: 'feet',
            }),
          ],
        }),
      },
      { missile: effect({ pathname: 'soul.beff', anchor: null, flight }) },
    ),
  });

  /** Follow the one flying mote until it is gone, recording where it went. */
  async function flight(
    kind: MissileFlight,
  ): Promise<{ path: Array<[number, number, number]>; h: Harness }> {
    const h = harness(drain(kind));
    await h.combat.release(1, 1, 2000, 20, [2]);
    const path: Array<[number, number, number]> = [];
    for (let t = 0; t < 6; t += 1 / 60) {
      h.combat.update(1 / 60);
      await Promise.resolve();
      const mote = h.live().find(i => i.path === 'soul.beff');
      if (!mote) break;
      if (!mote.paused) path.push([...mote.pos]);
    }
    return { path, h };
  }

  for (const [name, type] of [
    ['fast', 'drain1'],
    ['slow', 'drain2'],
  ] as const) {
    it(`rises out of the victim, then streams to the caster (${name})`, async () => {
      const { path, h } = await flight(type);
      // Victim (body 2) stands at x = 30, the caster (body 1) at the origin.
      const first = path[0]!;
      expect(first[0]).toBeGreaterThan(27);
      // It climbs above the victim's chest (0.95 + 1.9 / 4) before leaving.
      const top = Math.max(...path.map(p => p[1]));
      expect(top).toBeGreaterThan(1.425 + 1);
      // Its highest point is still over the victim, not partway across.
      const peak = path.find(p => p[1] === top)!;
      expect(Math.hypot(peak[0] - 30, peak[2])).toBeLessThan(3);
      // And it ends at the caster, where the drain completes.
      const last = path.at(-1)!;
      expect(Math.hypot(last[0], last[2])).toBeLessThan(1);
      // The impact is still the victim's.
      const pow = h.live().filter(i => i.path === 'pow.beff');
      expect(pow).toHaveLength(1);
      expect(pow[0]!.pos[0]).toBeCloseTo(30, 5);
    });
  }

  it('lingers over the victim longer when it is the slow kind', async () => {
    const overVictim = (path: Array<[number, number, number]>): number =>
      path.filter(p => Math.hypot(p[0] - 30, p[2]) < 3).length;
    const fast = await flight('drain1');
    const slow = await flight('drain2');
    expect(overVictim(slow.path)).toBeGreaterThan(overVictim(fast.path) * 2);
  });
});

describe('where an impact is put', () => {
  const chestHit = (): Record<number, SpellVisualData> => ({
    1: visual({
      impact: state({
        effects: [
          effect({
            pathname: 'pow.beff',
            placement: 'burst',
            anchor: 'chest',
          }),
        ],
      }),
    }),
  });

  it('pushes it out of the body it struck, toward the camera', async () => {
    const h = harness(chestHit());

    h.combat.playHit(2, 1);
    await advance(h, 0.05);

    const pow = h.live().find(i => i.path === 'pow.beff')!;
    // The chest bone of the body at x=30 is at (30, 1.2, 0). Placed exactly
    // there the burst plays inside the torso and reads as a faint glow.
    const bone = [30, 1.2, 0];
    const moved = [0, 1, 2].map(i => pow.pos[i]! - bone[i]!);
    const distance = Math.hypot(...moved);

    // Out past the near half of the body (0.7 wide) so it clears the
    // surface, and not so far that it hangs between the body and the eye.
    expect(distance).toBeGreaterThan(0.35);
    expect(distance).toBeLessThan(0.7);

    // And in the direction of the camera, which is what makes it visible from
    // wherever the player happens to be standing.
    const toCamera = [0 - bone[0]!, 100 - bone[1]!, 0 - bone[2]!];
    const toCameraLength = Math.hypot(...toCamera);
    const dot = moved.reduce((sum, m, i) => sum + (m * toCamera[i]!) / toCameraLength, 0);
    expect(dot).toBeCloseTo(distance, 5);
  });

  it('puts a ground-slot effect at the feet of the body it belongs to', async () => {
    const h = harness({
      1: visual({
        lasting: state({
          effects: [
            effect({
              pathname: 'burning.beff',
              anchor: 'feet',
            }),
          ],
        }),
      }),
    });

    await h.combat.addAura(3, 1, 0);
    await advance(h, 0.05);

    const burning = h.live().find(i => i.path === 'burning.beff')!;
    // The body at (0, 0, 30), not the caster and not the origin.
    expect(burning.pos[0]).toBeCloseTo(0, 5);
    expect(burning.pos[2]).toBeCloseTo(30, 5);
    // Just above the ground, never in it.
    expect(burning.pos[1]).toBeGreaterThan(0);
    expect(burning.pos[1]).toBeLessThan(0.1);
    expect(burning.node).toBeNull();
  });

  it('keeps an impact on a body that moves while it plays', async () => {
    const h = harness(chestHit());

    h.combat.playHit(2, 1);
    await advance(h, 0.05);
    h.positions.set(2, [40, 0, 5]);
    await advance(h, 0.05);

    const pow = h.live().find(i => i.path === 'pow.beff')!;
    // Over the body's new place, give or take the nudge toward the camera.
    expect(Math.hypot(pow.pos[0] - 40, pow.pos[2] - 5)).toBeLessThan(0.7);
  });

  it('keeps a ground-slot aura under a body that walks off', async () => {
    const h = harness({
      1: visual({
        lasting: state({ effects: [effect({ pathname: 'burning.beff', anchor: 'feet' })] }),
      }),
    });

    await h.combat.addAura(3, 1, 0);
    await advance(h, 0.05);
    h.positions.set(3, [8, 2, 30]);
    await advance(h, 0.05);

    const burning = h.live().find(i => i.path === 'burning.beff')!;
    expect(burning.pos[0]).toBeCloseTo(8, 5);
    expect(burning.pos[1]).toBeGreaterThan(2);
    expect(burning.pos[2]).toBeCloseTo(30, 5);
  });

  it('leaves an area effect on the point it was aimed at', async () => {
    const h = harness({
      1: visual({
        area: state({ effects: [effect({ pathname: 'quake.beff', anchor: 'area' })] }),
      }),
    });

    h.combat.playAreaEffect(1, 1, [5, 0, 5]);
    await advance(h, 0.05);
    h.positions.set(1, [20, 0, 20]);
    await advance(h, 0.05);

    const quake = h.live().find(i => i.path === 'quake.beff')!;
    expect(quake.pos[0]).toBeCloseTo(5, 5);
    expect(quake.pos[2]).toBeCloseTo(5, 5);
  });
});

describe('a cast with no projectile', () => {
  const melee = (impactDelayMs: number): Record<number, SpellVisualData> => ({
    7: visual(
      {
        release: state({ casterClipId: 42, casterClip: 'combat01' }),
        impact: state({
          effects: [effect({ pathname: 'sparks.beff', placement: 'burst' })],
        }),
      },
      { id: 7, impactDelayMs },
    ),
  });

  it('plays the impact on every target, after the swing has landed', async () => {
    const h = harness(melee(400));

    await h.combat.release(1, 7, 0, 0, [2, 3]);
    await advance(h, 0.1);

    // Created, but held: the blow has not landed yet.
    const sparks = h.instances.filter(i => i.path === 'sparks.beff');
    expect(sparks).toHaveLength(2);
    expect(sparks.every(i => i.paused)).toBe(true);

    await advance(h, 0.5);
    expect(sparks.every(i => i.paused)).toBe(false);
  });

  it("winds the caster's release particles down once the blow has landed", async () => {
    const visuals = melee(100);
    visuals[7]!.phases.release = state({
      casterClip: 'magic_directed_release',
      effects: [effect({ pathname: 'charged-hand.beff' })],
    });
    const h = harness(visuals);

    await h.combat.release(1, 7, 1000, 0, [2]);
    await advance(h, 0.05);
    const hand = h.instances.find(i => i.path === 'charged-hand.beff')!;
    expect(hand.woundDown).toBe(false);

    await advance(h, 0.1);
    expect(hand.woundDown).toBe(true);
    // Still showing while what it made fades, then gone once it is spent.
    expect(h.live()).toContain(hand);
    hand.finished = true;
    await advance(h, 0.05);
    expect(h.live()).not.toContain(hand);
  });

  it('winds the release down when the spell named nobody at all', async () => {
    const visuals = melee(100);
    visuals[7]!.phases.release = state({ effects: [effect({ pathname: 'charged-hand.beff' })] });
    const h = harness(visuals);

    await h.combat.release(1, 7, 1000, 0, []);
    await advance(h, 0.2);
    expect(h.instances.find(i => i.path === 'charged-hand.beff')!.woundDown).toBe(true);
  });

  it('clears an impact once its particles have burnt out', async () => {
    const h = harness(melee(0));

    await h.combat.release(1, 7, 0, 0, [2]);
    await advance(h, 0.1);
    expect(h.live().some(i => i.path === 'sparks.beff')).toBe(true);

    // The renderer says the burst is spent; nothing else has to time it.
    for (const i of h.instances) i.finished = true;
    await advance(h, 0.1);

    expect(h.live().some(i => i.path === 'sparks.beff')).toBe(false);
  });
});

describe('weapon streak', () => {
  const strike = () => ({
    6: visual(
      {
        windUp: state({ casterClip: 'gather', casterClipLoops: true }),
        release: state({ casterClip: 'combat_special' }),
      },
      { id: 6, weaponStreak: 3 },
    ),
  });

  it('streaks the weapon when the blow goes off, not while it winds up', async () => {
    const h = harness(strike());
    h.combat.beginCast(1, 6);
    await advance(h, 0.05);
    expect(h.stripes).toEqual([]);

    await h.combat.release(1, 6, 1000, 0, []);
    expect(h.stripes).toEqual([{ entityId: 1, index: 3 }]);
  });

  it('streaks an instant strike whose swing is its opening', async () => {
    const h = harness({
      6: visual({ opening: state({ casterClip: 'combat_special' }) }, { id: 6, weaponStreak: 2 }),
    });
    await h.combat.release(1, 6, 0, 0, []);
    expect(h.stripes).toEqual([{ entityId: 1, index: 2 }]);
  });
});

describe('choosing which phase to release with', () => {
  it('releases with the release phase when the visual has one', async () => {
    const h = harness({
      1: visual({
        opening: state({
          effects: [effect({ pathname: 'opening.beff' })],
        }),
        release: state({
          effects: [effect({ pathname: 'release.beff' })],
        }),
      }),
    });

    await h.combat.release(1, 1, 0, 0, []);
    await advance(h, 0.05);

    expect(h.instances.map(i => i.path)).toEqual(['release.beff']);
  });

  it('falls back to the opening, but only for an instant spell', async () => {
    const visuals = {
      1: visual({
        opening: state({
          effects: [effect({ pathname: 'opening.beff' })],
        }),
      }),
    };

    const instant = harness(visuals);
    await instant.combat.release(1, 1, 0, 0, []);
    await advance(instant, 0.05);
    expect(instant.instances.map(i => i.path)).toEqual(['opening.beff']);

    // A spell that takes time to cast has already shown its wind-up, so the
    // opening is not replayed for it.
    const slow = harness(visuals);
    await slow.combat.release(1, 1, 2500, 0, []);
    await advance(slow, 0.05);
    expect(slow.instances).toHaveLength(0);
  });
});

describe('ending the wind-up', () => {
  it('lets go of the chant when the spell goes off with nothing else to show', async () => {
    const h = harness({
      1: visual({
        windUp: state({
          casterClip: 'gather',
          casterClipLoops: true,
          effects: [effect({ pathname: 'inhand.beff' })],
        }),
      }),
    });
    h.combat.beginCast(1, 1);
    await advance(h, 0.05);
    expect(h.live().some(i => i.path === 'inhand.beff')).toBe(true);

    await h.combat.release(1, 1, 2000, 0, []);
    await advance(h, 0.05);
    expect(h.stops).toContain(1);
    expect(h.live()).toHaveLength(0);
  });
});

describe('auras', () => {
  const buff = (): Record<number, SpellVisualData> => ({
    5: visual(
      {
        // Column five of the table, not column four. Reading the hit state
        // here is the off-by-one that shows shields as impact sparks.
        impact: state({
          effects: [effect({ pathname: 'impact.beff' })],
        }),
        lasting: state({
          effects: [
            effect({
              pathname: 'shield.beff',
              anchor: 'chest',
            }),
          ],
        }),
      },
      { id: 5 },
    ),
  });

  it('holds the aura visual, not the impact one', async () => {
    const h = harness(buff());

    await h.combat.addAura(2, 5, 0);
    await advance(h, 0.05);

    expect(h.live().map(i => i.path)).toEqual(['shield.beff']);
    expect(h.live()[0]!.node).toBe('Bip01_Spine');
  });

  it('does not stack a second copy when the server refreshes it', async () => {
    const h = harness(buff());

    await h.combat.addAura(2, 5, 10_000);
    await h.combat.addAura(2, 5, 10_000);
    await h.combat.addAura(2, 5, 10_000);
    await advance(h, 0.05);

    expect(h.live()).toHaveLength(1);
  });

  it('holds an aura with no stated duration until it is taken away', async () => {
    const h = harness(buff());

    await h.combat.addAura(2, 5, 0);
    await advance(h, 5);
    expect(h.live()).toHaveLength(1);

    h.combat.removeAura(2, 5);
    expect(h.live()).toHaveLength(0);
  });

  it('drops an aura when its duration runs out', async () => {
    const h = harness(buff());

    await h.combat.addAura(2, 5, 500);
    await advance(h, 0.2);
    expect(h.live()).toHaveLength(1);

    await advance(h, 0.6);
    expect(h.live()).toHaveLength(0);
  });

  it('takes everything down with a body that leaves the world', async () => {
    const h = harness(buff());

    await h.combat.addAura(2, 5, 0);
    await advance(h, 0.05);
    h.combat.forget(2);

    expect(h.live()).toHaveLength(0);
  });
});

describe('a ranged shot', () => {
  it('looses immediately and names the shot animation from the visual', async () => {
    const h = harness({
      9: visual(
        { release: state({ casterClipId: 78, casterClip: 'combat_fire' }) },
        { id: 9, missile: effect({ pathname: 'arrow.beff', anchor: null }) },
      ),
    });

    const clip = await h.combat.rangeLaunch(1, 2, 9, 40);
    expect(clip).toBe('combat_fire');

    // No launch delay: an arrow leaves the bow when the bow says so.
    await advance(h, 1 / 60, 1 / 60);
    const arrow = h.instances.find(i => i.path === 'arrow.beff');
    expect(arrow?.paused).toBe(false);
  });

  it('starts the visual-authored weapon stripe for a ranged launch', async () => {
    const h = harness({
      9: visual(
        {},
        {
          id: 9,
          weaponStreak: 4,
        },
      ),
    });
    await h.combat.rangeLaunch(1, 2, 9, 40);
    expect(h.stripes).toEqual([{ entityId: 1, index: 4 }]);
  });

  it('reports no animation when the visual names none', async () => {
    const h = harness({ 9: visual({}, { id: 9 }) });
    await expect(h.combat.rangeLaunch(1, 2, 9, 40)).resolves.toBeNull();
  });
});

describe('teardown', () => {
  it('leaves nothing behind on a zone change', async () => {
    const h = harness({
      1: visual(
        {
          windUp: state({
            casterClipId: 110,
            casterClip: 'gather',
            casterClipLoops: true,
            effects: [effect({ pathname: 'inhand.beff' })],
          }),
        },
        { missile: effect({ pathname: 'shoot.beff', anchor: null }) },
      ),
      5: visual(
        {
          lasting: state({ effects: [effect({ pathname: 'shield.beff' })] }),
        },
        { id: 5 },
      ),
    });

    h.combat.beginCast(1, 1);
    await h.combat.addAura(2, 5, 0);
    await advance(h, 0.05);
    expect(h.live().length).toBeGreaterThan(0);

    h.combat.clear();
    expect(h.live()).toHaveLength(0);
    // And the chant it was holding is released, or the caster stands frozen
    // in the pose for the rest of the session.
    expect(h.stops).toContain(1);
  });

  it('survives a visual the build does not ship', async () => {
    const h = harness({});
    const noop = vi.fn();

    h.combat.beginCast(1, 404);
    await h.combat.release(1, 404, 0, 30, [2]);
    h.combat.playHit(2, 404);
    await h.combat.addAura(2, 404, 1000);
    await advance(h, 0.2);

    expect(h.live()).toHaveLength(0);
    expect(noop).not.toHaveBeenCalled();
  });
});

/*
 * Which visual a cast plays: the clip and particles both hang off it, and a
 * cast naming visual 0 shows nothing, silently.
 */
describe('which visual a cast plays', () => {
  it('uses the one the server named', () => {
    expect(castVisualId(3, 99)).toBe(3);
  });

  it('falls back to the spell row when the server named none', () => {
    // A server whose spell data was imported without the visual column has
    // nothing to send and sends 0 for every cast. The spell's own row is
    // local data and still carries it.
    expect(castVisualId(0, 3)).toBe(3);
  });

  it('still answers none for a spell that really has none', () => {
    // The stealth family names no visual in the shipped data and shows
    // nothing when cast in the shipped game either. The fallback must not
    // invent a clip for one: "the server did not say" and "the answer is
    // none" are different questions, and only the first is a bug.
    expect(castVisualId(0, 0)).toBe(0);
  });

  it('prefers the wire even when the spell row disagrees', () => {
    // The server is the authority wherever it has an answer. A cast it
    // dressed differently from the spell's own row is its call to make, not
    // a disagreement for this client to correct.
    expect(castVisualId(7, 3)).toBe(7);
  });
});

describe('the loot glow', () => {
  const glow = (): Record<number, SpellVisualData> => ({
    9: visual(
      { lasting: state({ effects: [effect({ pathname: 'ore_shine.beff', anchor: 'chest' })] }) },
      { id: 9 },
    ),
  });

  it('holds the visual that shows the glow effect, until taken away', async () => {
    const h = harness(glow(), 9);
    h.combat.showLootGlow(2);
    await advance(h, 1);
    expect(h.live().map(i => i.path)).toEqual(['ore_shine.beff']);

    h.combat.hideLootGlow(2);
    await advance(h, 1);
    expect(h.live()).toHaveLength(0);
  });

  it('does not stack when asked twice for the same body', async () => {
    const h = harness(glow(), 9);
    h.combat.showLootGlow(2);
    h.combat.showLootGlow(2);
    await advance(h, 1);
    expect(h.live()).toHaveLength(1);
  });

  it('shows nothing when no spell visual carries the effect', async () => {
    const h = harness(glow(), null);
    h.combat.showLootGlow(2);
    await advance(h, 1);
    expect(h.live()).toHaveLength(0);
  });

  it('takes away only the glow, not another aura on the body', async () => {
    const h = harness(
      {
        ...glow(),
        5: visual(
          { lasting: state({ effects: [effect({ pathname: 'shield.beff' })] }) },
          { id: 5 },
        ),
      },
      9,
    );
    await h.combat.addAura(2, 5, 0);
    h.combat.showLootGlow(2);
    await advance(h, 1);
    h.combat.hideLootGlow(2);
    await advance(h, 1);
    expect(h.live().map(i => i.path)).toEqual(['shield.beff']);
  });
});

describe('what an aura removal takes off', () => {
  it('takes off the visual it names', () => {
    expect(auraRemovalVisual(5813, 42)).toBe(42);
  });

  it('takes off every aura only when the message names no spell', () => {
    expect(auraRemovalVisual(0, 0)).toBe(0);
  });

  it('takes off nothing for a named spell that has no visual', () => {
    /*
     * The trap this exists for. Zero means "every aura on this body", so a
     * message about ONE buff that resolves to no visual would strip every
     * other buff the body is wearing along with it. A named spell with no
     * visual added nothing, so it removes nothing.
     */
    expect(auraRemovalVisual(5813, 0)).toBeNull();
  });
});

describe('the sounds a cast makes', () => {
  const bolt = (): Record<number, SpellVisualData> => ({
    1: visual({
      windUp: state({ sound: 100 }),
      release: state({ sound: 7 }),
      impact: state({ sound: 8 }),
    }),
  });

  it('hums through the wind-up and falls quiet when the spell goes off', async () => {
    const h = harness(bolt());

    h.combat.beginCast(1, 1);
    await advance(h, 0.1);
    expect(h.heard).toEqual([{ cue: 100, unit: 1, stopped: false }]);

    await h.combat.release(1, 1, 2000, 0, [2]);
    await advance(h, 0.1);
    expect(h.heard.map(s => [s.cue, s.unit, s.stopped])).toEqual([
      [100, 1, true],
      [7, 1, false],
      [8, 2, false],
    ]);
  });

  it('stops the hum when the cast is cut short', async () => {
    const h = harness(bolt());

    h.combat.beginCast(1, 1);
    await advance(h, 0.1);
    h.combat.stopCast(1);
    expect(h.heard[0]!.stopped).toBe(true);
  });

  it('lets a one-shot finish on its own', async () => {
    const h = harness(bolt());

    await h.combat.release(1, 1, 0, 0, [2]);
    await advance(h, 2);
    expect(h.heard.filter(s => s.stopped)).toEqual([]);
  });
});
