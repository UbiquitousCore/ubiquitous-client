import { describe, expect, it, vi } from 'vitest';
import { DebugTools } from '../src/app/DebugTools';
import type { NetworkBodies } from '../src/gameplay/NetworkBodies';
import type { Renderer } from '../src/renderer/Renderer';
import type { ResourceSystem } from '../src/assets/ResourceSystem';
import type { World } from '../src/world/World';

const upright: [number, number, number, number] = [0, 0, 0, 1];

function entity(id: number, position: [number, number, number]) {
  return { id, position, rotation: upright, scale: [1, 1, 1], model: `m${id}`, kind: 'npc' };
}

function tools(overrides: { setCollisionDebug?: () => number } = {}) {
  const world = {
    player: { position: [0, 0, 0] },
    entities: new Map([
      [1, entity(1, [10, 0, 0])],
      [2, entity(2, [3, 0, 4])],
      [3, entity(3, [50, 0, 0])],
    ]),
  };
  const renderer = { setCollisionDebug: overrides.setCollisionDebug ?? (() => 5) };
  const bodies = { networkIdOf: vi.fn((id: number) => id * 100) };
  return new DebugTools(
    world as unknown as World,
    renderer as unknown as Renderer,
    bodies as unknown as NetworkBodies,
    {} as ResourceSystem,
    () => '',
    async () => null,
  );
}

describe('DebugTools', () => {
  it('lists what is placed within the radius, nearest first', () => {
    const rows = tools().nearby(12);
    expect(rows.map(row => row.model)).toEqual(['m2', 'm1']);
    expect(rows[0]).toMatchObject({ distance: 5, networkId: 200, tilted: false });
  });

  it('lists nothing when there is no player', () => {
    const t = tools();
    (t as unknown as { world: { player: null } }).world.player = null;
    expect(t.nearby()).toEqual([]);
  });

  it('refuses to show collision in a zone that has none', () => {
    const t = tools({ setCollisionDebug: () => 0 });
    expect(t.toggleCollision(true)).toBe(false);
    expect(t.collisionVisible()).toBe(true);
  });

  it('reports collision on once the zone has geometry', () => {
    const t = tools();
    expect(t.toggleCollision(true)).toBe(true);
    expect(t.toggleCollision(false)).toBe(false);
    expect(t.collisionVisible()).toBe(false);
  });
});

describe('DebugTools console', () => {
  function console_() {
    const hooks = {
      selfNetworkId: () => 7,
      attachSource: vi.fn(async () => undefined),
      lootSnapshot: () => ({
        states: [{ networkId: 9, state: 'glowing', resident: true }],
        fighting: [3],
        died: [{ networkId: 4 }],
      }),
      teleport: vi.fn((x: number, y: number, z: number) => ({ x, y, z })),
      sendStressTest: vi.fn(() => undefined),
    };
    const t = tools();
    const ubiquitous: Record<string, (...args: never[]) => unknown> = {};
    t.install(hooks, ubiquitous);
    return { t, ubiquitous, hooks };
  }

  it('hangs the tools on the target it is given', () => {
    const { ubiquitous } = console_();
    expect(Object.keys(ubiquitous)).toEqual(
      expect.arrayContaining([
        'missing',
        'useFile',
        'forgetFile',
        'inspect',
        'near',
        'effects',
        'findEffect',
        'markEffects',
        'collision',
        'wireframe',
        'nav',
        'fog',
        'teleport',
        'stressTest',
        'net',
        'damage',
        'combat',
        'loot',
      ]),
    );
  });

  it('passes teleport through to the game', () => {
    const { ubiquitous } = console_();
    expect((ubiquitous.teleport as (x: number, y: number, z: number) => unknown)(1, 2, 3)).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it('passes a stress test through to the game', () => {
    const { ubiquitous, hooks } = console_();
    expect((ubiquitous.stressTest as (count: number) => string)(100)).toBe('stress test requested: 100');
    expect(hooks.sendStressTest).toHaveBeenCalledWith(100);
  });

  it('refuses a stress test without a count instead of sending it', () => {
    const { ubiquitous, hooks } = console_();
    expect((ubiquitous.stressTest as () => string)()).toBe('usage: ubiquitous.stressTest(count)');
    expect(hooks.sendStressTest).not.toHaveBeenCalled();
  });

  it('switches the damage log with ubiquitous.damage', () => {
    const { ubiquitous, t } = console_();
    const damage = ubiquitous.damage as (on?: boolean) => string;
    expect(t.damageLogOn).toBe(false);
    expect(damage()).toBe('damage log on');
    expect(t.damageLogOn).toBe(true);
    expect(damage(false)).toBe('damage log off');
    expect(t.damageLogOn).toBe(false);
  });

  it('reports recorded combat events, stamped, newest last, capped', () => {
    const { ubiquitous, t } = console_();
    for (let i = 0; i < 45; i++) t.recordCombat({ i });
    const report = (
      ubiquitous.combat as () => { self: number; floats: number; events: Array<{ i: number; at: number }> }
    )();
    expect(report.self).toBe(7);
    expect(report.floats).toBe(0);
    expect(report.events).toHaveLength(40);
    expect(report.events[0].i).toBe(5);
    expect(report.events[39].i).toBe(44);
    expect(typeof report.events[0].at).toBe('number');
  });

  it('reports loot attempts with the game snapshot, rounding distance and keeping eight', () => {
    const { ubiquitous, t } = console_();
    for (let i = 0; i < 10; i++) {
      t.recordLootAttempt({
        networkId: i,
        entry: 1,
        distance: i === 9 ? null : 2.449,
        why: 'near',
        sent: true,
      });
    }
    const report = (
      ubiquitous.loot as () => Record<string, unknown> & {
        attempts: Array<{ networkId: number; distance: number | null }>;
      }
    )();
    expect(report).toMatchObject({
      self: 7,
      open: null,
      states: [{ networkId: 9, state: 'glowing', resident: true }],
      fighting: [3],
      died: [{ networkId: 4 }],
    });
    expect(report.attempts.map(a => a.networkId)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(report.attempts[0].distance).toBe(2.4);
    expect(report.attempts[7].distance).toBeNull();
  });
});
