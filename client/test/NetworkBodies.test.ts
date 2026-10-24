/** Server movement messages into world motion: motion kinds, facing, and when a body stops. Fakes only. */

import { describe, expect, it, vi } from 'vitest';

import {
  NetworkBodies,
  STATIC_FADE_OUT_MS,
  SYNC_WALK_MIN,
  clipRateFor,
  gaitFor,
} from '../src/gameplay/NetworkBodies';
import type { BodyLookups, BodyViews } from '../src/gameplay/NetworkBodies';
import { World, gameYaw } from '../src/world/World';
import type { Appearance } from '../src/assets/types';
import type { EntitySnapshot } from '../src/net/GameConnection';
import { EntityMovementState } from '../src/net/GameConnection';
import { UNARMED } from '../src/gameplay/weaponClips';
import { FIDGET_CLIPS, FIDGET_WAIT } from '../src/gameplay/idleFidgets';
import { isInteractable } from '../src/gameplay/npcInteraction';
import { QUEST_GESTURES } from '../src/gameplay/questGestures';

function views(overrides: Partial<BodyViews> = {}): BodyViews {
  return {
    isAnimated: () => true,
    clipOf: () => null,
    clipLength: () => 1,
    setEntityClip: vi.fn(async () => {}),
    poseEntityClip: vi.fn(async () => {}),
    setEntityClipRate: vi.fn(),
    setEntityWeapons: vi.fn(),
    setEntityAction: vi.fn(async () => {}),
    clearEntityAction: vi.fn(),
    hasHeldAction: () => false,
    refreshAppearance: vi.fn(async () => {}),
    setEntityMount: vi.fn(async () => {}),
    ...overrides,
  };
}

/** A resolved look, with only the fields any assertion here reads. */
function look(key: string): Appearance {
  return { skin: null, meshes: [], skinReplacesAll: false, key };
}

function lookups(overrides: Partial<BodyLookups> = {}): BodyLookups {
  return {
    networkAppearance: async () => ({ model: 'wolf.bdae', scale: 1 }),
    staticObjectModel: async () => ({ model: 'other_bank.bdae', scale: 1 }),
    animationNamed: async () => null,
    equippedWeapons: async () => UNARMED,
    ...overrides,
  };
}

function world() {
  return new World({} as ConstructorParameters<typeof World>[0]);
}

/** A minimal spawn. `entry` non-zero makes it a creature. */
function snapshot(over: Partial<EntitySnapshot> = {}): EntitySnapshot {
  return {
    networkId: 1,
    entry: 2451,
    displayInfoId: 0,
    race: 0,
    gender: 0,
    appearance: { skin: 0, hairStyle: 0, hairColour: 0, face: 0 },
    equipment: [],
    animationId: 0,
    position: [0, 0, 0],
    orientation: 0,
    ...over,
  };
}

/** An open `NetworkBodies` with one body already spawned and linked. */
async function withBody(over: Partial<EntitySnapshot> = {}) {
  const w = world();
  const bodies = new NetworkBodies(w, views(), lookups());
  bodies.open();
  bodies.take({ kind: 'spawned', snapshot: snapshot(over) });
  await Promise.resolve();
  await Promise.resolve();
  const entity = [...w.entities.values()][0]!;
  return { w, bodies, entity };
}

describe('a body turned into another shape', () => {
  const demon = { model: 'demon.bdae', scale: 2.7, appearance: look('skin:demon.tga') };
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };

  function turnable() {
    const v = views();
    const w = world();
    const asked: Array<{ displayInfoId: number }> = [];
    const bodies = new NetworkBodies(
      w,
      v,
      lookups({
        networkAppearance: async input => {
          asked.push({ displayInfoId: input.shape ?? 0 });
          return input.shape === 1962 ? demon : { model: 'wolf.bdae', scale: 1 };
        },
      }),
    );
    bodies.open();
    return { v, w, bodies, asked };
  }

  it("takes the other display's model, size and look, and rebuilds its view", async () => {
    const { v, w, bodies } = turnable();
    bodies.take({ kind: 'spawned', snapshot: snapshot() });
    await flush();

    bodies.transform(1, 1962);
    await flush();

    const entity = [...w.entities.values()][0]!;
    expect(entity.model).toBe('demon.bdae');
    expect(entity.scale).toEqual([2.7, 2.7, 2.7]);
    expect(entity.appearance?.key).toBe('skin:demon.tga');
    expect(v.refreshAppearance).toHaveBeenCalledWith(entity);
  });

  it('builds one body when the same shape is asked for twice (a spell announced for each of its effects)', async () => {
    const { v, bodies } = turnable();
    bodies.take({ kind: 'spawned', snapshot: snapshot() });
    await flush();

    bodies.transform(1, 1962);
    bodies.transform(1, 1962);
    await flush();

    expect(v.refreshAppearance).toHaveBeenCalledTimes(1);
  });

  it('goes back to its own display when told 0', async () => {
    const { w, bodies, asked } = turnable();
    bodies.take({ kind: 'spawned', snapshot: snapshot() });
    await flush();
    bodies.transform(1, 1962);
    await flush();

    bodies.transform(1, 0);
    await flush();

    const entity = [...w.entities.values()][0]!;
    expect(entity.model).toBe('wolf.bdae');
    expect(asked.at(-1)).toEqual({ displayInfoId: 0 });
  });

  it('waits for a body still loading and turns it as soon as it is there', async () => {
    const { w, bodies } = turnable();
    bodies.take({ kind: 'spawned', snapshot: snapshot() });

    bodies.transform(1, 1962);
    await flush();
    await flush();

    expect([...w.entities.values()][0]!.model).toBe('demon.bdae');
  });

  it('leaves a corpse as it lies', async () => {
    const { w, bodies } = turnable();
    bodies.take({ kind: 'spawned', snapshot: snapshot({ dead: true }) });
    await flush();

    bodies.transform(1, 1962);
    await flush();

    expect([...w.entities.values()][0]!.model).toBe('wolf.bdae');
  });

  it('holds a still pose in a shape whose model lies down, and idles again when it ends', async () => {
    const v = views();
    const w = world();
    const lying = { model: 'ariel_dead.bdae', scale: 1, appearance: look('skin:ariel_dead.tga') };
    const bodies = new NetworkBodies(
      w,
      v,
      lookups({
        networkAppearance: async input =>
          input.shape === 1978 ? lying : { model: 'ariel.bdae', scale: 1 },
      }),
    );
    bodies.open();
    bodies.take({ kind: 'spawned', snapshot: snapshot() });
    await flush();

    bodies.transform(1, 1978);
    await flush();
    bodies.updateClips(1 / 60);
    expect(v.poseEntityClip).toHaveBeenCalledWith(expect.anything(), 'dead_ground');

    vi.mocked(v.poseEntityClip).mockClear();
    bodies.transform(1, 0);
    await flush();
    bodies.updateClips(1 / 60);
    expect(v.poseEntityClip).not.toHaveBeenCalled();
    expect(v.setEntityClip).toHaveBeenCalled();
  });

  it('turns a body whose aura arrived before the body did', async () => {
    const { w, bodies } = turnable();

    bodies.transform(1, 1962);
    bodies.take({ kind: 'spawned', snapshot: snapshot() });
    await flush();

    expect([...w.entities.values()][0]!.model).toBe('demon.bdae');
  });

  it('turns another player too, and back again', async () => {
    const { w, bodies } = turnable();
    bodies.take({ kind: 'spawned', snapshot: snapshot({ entry: 0 }) });
    await flush();

    bodies.transform(1, 1962);
    await flush();
    expect([...w.entities.values()][0]!.model).toBe('demon.bdae');

    bodies.transform(1, 0);
    await flush();
    expect([...w.entities.values()][0]!.model).toBe('wolf.bdae');
  });
});

describe('getting a body into the world', () => {
  it('resolves the model locally and mirrors the server facing', async () => {
    const { entity } = await withBody({ orientation: 2.7053 });

    expect(entity.model).toBe('wolf.bdae');
    // The server stores a yaw that draws as `pi - yaw`. Skipping that
    // mirrors the body about the north-south axis.
    const yaw = Math.atan2(
      2 * entity.rotation[3] * entity.rotation[1],
      1 - 2 * entity.rotation[1] * entity.rotation[1],
    );
    expect(yaw).toBeCloseTo(gameYaw(2.7053), 4);
  });

  it('keeps what the server said about a body that never fights back', async () => {
    const { entity } = await withBody({ neverFightsBack: true });
    expect(entity.networkNeverFightsBack).toBe(true);

    const { entity: other } = await withBody();
    expect(other.networkNeverFightsBack).toBeUndefined();
  });

  it('seats a body on the mount it was given while the zone loaded, once it is built', async () => {
    const v = views();
    const w = world();
    const bodies = new NetworkBodies(w, v, lookups());
    bodies.close();
    bodies.take({ kind: 'spawned', snapshot: snapshot({ entry: 0 }) });
    bodies.setMount(1, 3060);
    bodies.open();
    await Promise.resolve();
    await Promise.resolve();
    const entity = [...w.entities.values()][0]!;
    expect(v.setEntityMount).toHaveBeenCalledWith(entity.id, 3060);
  });

  it('poses a body dead at spawn instead of playing its death', async () => {
    const v = views();
    const w = world();
    const bodies = new NetworkBodies(w, v, lookups({ animationNamed: async () => 'die' }));
    bodies.open();
    bodies.take({ kind: 'spawned', snapshot: snapshot({ dead: true }) });
    await Promise.resolve();
    await Promise.resolve();
    bodies.updateClips(1 / 60);
    expect(v.poseEntityClip).toHaveBeenCalledWith(expect.anything(), 'die');
  });

  it('poses a corpse again when its view was rebuilt standing, and leaves it once it holds', async () => {
    const v = views();
    let clip: string | null = null;
    v.clipOf = () => clip;
    const w = world();
    const bodies = new NetworkBodies(w, v, lookups({ animationNamed: async () => 'die' }));
    bodies.open();
    bodies.take({ kind: 'spawned', snapshot: snapshot({ dead: true }) });
    await Promise.resolve();
    await Promise.resolve();

    bodies.updateClips(1 / 60);
    expect(v.poseEntityClip).toHaveBeenCalledTimes(1);

    // The view is replaced and stands: it is posed again.
    bodies.updateClips(1 / 60);
    expect(v.poseEntityClip).toHaveBeenCalledTimes(2);

    // Now it holds the corpse clip: no more asking.
    clip = 'die';
    bodies.updateClips(1 / 60);
    bodies.updateClips(1 / 60);
    expect(v.poseEntityClip).toHaveBeenCalledTimes(2);
  });

  it('stops asking for a pose a model cannot give', async () => {
    const v = views();
    v.clipOf = () => null;
    const w = world();
    const bodies = new NetworkBodies(w, v, lookups({ animationNamed: async () => 'die' }));
    bodies.open();
    bodies.take({ kind: 'spawned', snapshot: snapshot({ dead: true }) });
    await Promise.resolve();
    await Promise.resolve();

    for (let frame = 0; frame < 100; frame++) bodies.updateClips(1 / 60);

    expect(vi.mocked(v.poseEntityClip).mock.calls.length).toBeLessThanOrEqual(30);
  });

  it('stops a body that is already dead where it lies', async () => {
    const { w, entity } = await withBody({ dead: true, position: [5, 1, 7] });

    expect(entity.networkDead).toBe(true);
    expect(entity.position[0]).toBe(5);
    expect(entity.position[2]).toBe(7);
    expect(w.entities.get(entity.id)?.network?.path ?? []).toEqual([]);
  });

  it('poses a corpse once its view is built, not only if it already was', async () => {
    let built = false;
    // As the renderer does: a pose sets the clip the view holds, and a rebuilt view starts with none.
    let held: string | null = null;
    const v = views({ isAnimated: () => built, clipOf: () => held });
    v.poseEntityClip = vi.fn(async (_id, clip) => {
      held = clip;
    });
    const bodies = new NetworkBodies(world(), v, lookups({ animationNamed: async () => 'die' }));
    bodies.open();
    bodies.take({ kind: 'spawned', snapshot: snapshot({ dead: true }) });
    await Promise.resolve();
    await Promise.resolve();
    bodies.updateClips(1 / 60);
    expect(v.poseEntityClip).not.toHaveBeenCalled();

    built = true;
    bodies.updateClips(1 / 60);
    bodies.updateClips(1 / 60);
    expect(v.poseEntityClip).toHaveBeenCalledTimes(1);
    expect(v.poseEntityClip).toHaveBeenCalledWith(expect.anything(), 'die');

    // The view is rebuilt, say after streaming out and back: posed again.
    built = false;
    held = null;
    bodies.updateClips(1 / 60);
    built = true;
    bodies.updateClips(1 / 60);
    expect(v.poseEntityClip).toHaveBeenCalledTimes(2);
  });

  it('tells a creature holding a shield to fight bare-handed, and a character holding one to swing nothing', async () => {
    const shield = { entry: 5, itemClass: 4, subClass: 5 };
    const empty = { entry: 0, itemClass: 0, subClass: 0 };
    const weapons = { mainhand: shield, offhand: empty, ranged: empty };
    for (const [kind, mainhand] of [
      ['creature', 'stave'],
      ['player', ''],
    ] as const) {
      const v = views();
      const bodies = new NetworkBodies(world(), v, lookups());
      bodies.open();
      bodies.take({
        kind: 'spawned',
        snapshot: snapshot({ kind, weapons, entry: kind === 'player' ? 0 : 2451 }),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(v.setEntityWeapons).toHaveBeenCalledWith(expect.anything(), {
        mainhand,
        offhand: 'stave',
        ranged: 'thrown',
      });
    }
  });

  it('fights a creature with what its look holds, though the server names no kind or hands', async () => {
    const sword = { entry: 77, itemClass: 2, subClass: 0 };
    const empty = { entry: 0, itemClass: 0, subClass: 0 };
    const v = views();
    const bodies = new NetworkBodies(
      world(),
      v,
      lookups({
        networkAppearance: async () => ({
          model: 'bandit.bdae',
          scale: 1,
          heldItems: { mainhand: sword, offhand: empty, ranged: empty },
        }),
      }),
    );
    bodies.open();
    bodies.take({ kind: 'spawned', snapshot: snapshot({ kind: undefined }) });
    await Promise.resolve();
    await Promise.resolve();
    expect(v.setEntityWeapons).toHaveBeenCalledWith(expect.anything(), {
      mainhand: '1h',
      offhand: 'stave',
      ranged: 'thrown',
    });
  });

  it('keeps a beast with empty hands on its bare clips', async () => {
    const v = views();
    const bodies = new NetworkBodies(world(), v, lookups());
    bodies.open();
    bodies.take({ kind: 'spawned', snapshot: snapshot({ kind: undefined }) });
    await Promise.resolve();
    await Promise.resolve();
    expect(v.setEntityWeapons).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('resolves a static object through its own table, not the creature one', async () => {
    // `networkAppearance` only ever knows `creature_proto` — a static
    // object's entry is never in it, and asking it anyway is what silently
    // dropped every bank, mailbox and notice board the server ever sent.
    // The two mocks return different models so this fails loudly if the
    // wrong one is ever called again.
    const { entity } = await withBody({
      kind: 'staticObject',
      entry: 145,
      staticObjectType: 9,
      canInteract: true,
    });
    expect(entity.kind).toBe('static');
    expect(entity.model).toBe('other_bank.bdae');
  });

  it('holds events until the world can take them, then replays them in order', async () => {
    const w = world();
    const bodies = new NetworkBodies(w, views(), lookups());

    // Nothing is open yet: a spawn now must not reach the world.
    bodies.take({ kind: 'spawned', snapshot: snapshot() });
    await Promise.resolve();
    expect(w.entities.size).toBe(0);

    bodies.open();
    await Promise.resolve();
    await Promise.resolve();
    expect(w.entities.size).toBe(1);
  });

  it('takes a removed body out of the world', async () => {
    const { w, bodies } = await withBody();
    expect(w.entities.size).toBe(1);

    bodies.take({ kind: 'removed', networkId: 1 });
    expect(w.entities.size).toBe(0);
  });

  describe('a staticObject the server says can be gathered from', () => {
    it('is marked gatherable, so a click on it is not ignored', async () => {
      const { entity } = await withBody({
        kind: 'staticObject',
        entry: 132,
        staticObjectType: 1,
        canInteract: true,
      });

      expect(entity.gatherable).toBe(true);
      expect(isInteractable(entity)).toBe(true);
    });

    it('is not marked when it is some other kind of object', async () => {
      const { entity } = await withBody({
        kind: 'staticObject',
        entry: 7001,
        staticObjectType: 6,
        canInteract: true,
      });

      expect(entity.gatherable).toBeUndefined();
      expect(isInteractable(entity)).toBe(false);
    });
  });

  describe('a staticObject the server removes', () => {
    it('dissolves away first, and leaves the world once the fade is over', async () => {
      vi.useFakeTimers();
      try {
        const fadeOutEntity = vi.fn();
        const w = world();
        const bodies = new NetworkBodies(w, views({ fadeOutEntity }), lookups());
        bodies.open();
        bodies.take({ kind: 'spawned', snapshot: snapshot({ kind: 'staticObject', entry: 132 }) });
        await vi.advanceTimersByTimeAsync(0);
        expect(w.entities.size).toBe(1);

        bodies.take({ kind: 'removed', networkId: 1 });

        expect(fadeOutEntity).toHaveBeenCalledTimes(1);
        expect(w.entities.size).toBe(1);
        await vi.advanceTimersByTimeAsync(STATIC_FADE_OUT_MS);
        expect(w.entities.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('a staticObject that the local spawn table already placed', () => {
    /*
     * The server tells every client a bank or a festival decoration exists,
     * by entry and position — the same entry the local spawn table placed
     * with its own authored scale. Spawning a second entity for it would draw
     * the same prop twice, a little apart on Y and at two different scales.
     * `staticTwin` finds the existing placement instead.
     */
    function withTilePlacement(w: World, over: Partial<Parameters<World['add']>[0]> = {}) {
      return w.add({
        kind: 'static',
        model: 'anniversary_flag_01.bdae',
        position: [10, 5, 20],
        rotation: [0, 0, 0, 1],
        scale: [0.62, 0.62, 0.62],
        entry: 288,
        tile: '0,0',
        ...over,
      });
    }

    it('merges onto the existing placement instead of spawning a second body', async () => {
      const w = world();
      const placed = withTilePlacement(w);
      const bodies = new NetworkBodies(w, views(), lookups());
      bodies.open();
      bodies.take({
        kind: 'spawned',
        snapshot: snapshot({
          kind: 'staticObject',
          entry: 288,
          staticObjectType: 1,
          canInteract: false,
          position: [10, 5.3, 20],
        }),
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(w.entities.size).toBe(1);
      const entity = [...w.entities.values()][0]!;
      expect(entity.id).toBe(placed.id);
      // The spawn table's own placement wins: authored scale and position.
      expect(entity.scale).toEqual([0.62, 0.62, 0.62]);
      expect(entity.position).toEqual([10, 5, 20]);
      expect(entity.networkId).toBe(1);
    });

    it('does not merge onto a placement too far away, or the wrong entry', async () => {
      const w = world();
      withTilePlacement(w, { position: [100, 5, 100] }); // out of range
      withTilePlacement(w, { entry: 999 }); // wrong entry, same spot
      const bodies = new NetworkBodies(w, views(), lookups());
      bodies.open();
      bodies.take({
        kind: 'spawned',
        snapshot: snapshot({
          kind: 'staticObject',
          entry: 288,
          staticObjectType: 1,
          canInteract: false,
          position: [10, 5, 20],
        }),
      });
      await Promise.resolve();
      await Promise.resolve();

      // A third, brand-new entity for the snapshot — neither placement matched.
      expect(w.entities.size).toBe(3);
    });

    it("keeps a summon stone's head icon through the merge and any quest mark after it", async () => {
      const w = world();
      const placed = withTilePlacement(w, {
        entry: 216,
        interactionIcon: 'ui/icons/head/ui_head_summon.png',
      });
      const bodies = new NetworkBodies(w, views(), lookups());
      bodies.open();
      bodies.take({
        kind: 'spawned',
        snapshot: snapshot({
          kind: 'staticObject',
          entry: 216,
          staticObjectType: 105,
          canInteract: true,
          position: [10, 5, 20],
        }),
      });
      await Promise.resolve();
      await Promise.resolve();

      const stone = w.entities.get(placed.id)!;
      expect(stone.interactionIcon).toBe('ui/icons/head/ui_head_summon.png');
      w.setQuestStatus(stone, 'none');
      expect(stone.interactionIcon).toBe('ui/icons/head/ui_head_summon.png');
    });

    it('leaves the placement standing when its network identity despawns', async () => {
      const w = world();
      const placed = withTilePlacement(w);
      const bodies = new NetworkBodies(w, views(), lookups());
      bodies.open();
      bodies.take({
        kind: 'spawned',
        snapshot: snapshot({
          kind: 'staticObject',
          entry: 288,
          staticObjectType: 1,
          canInteract: false,
          position: [10, 5, 20],
        }),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(w.entities.get(placed.id)?.networkId).toBe(1);

      bodies.take({ kind: 'removed', networkId: 1 });

      // Still there — only the tile that placed it may remove it.
      expect(w.entities.has(placed.id)).toBe(true);
      expect(w.entities.get(placed.id)?.networkId).toBeUndefined();
    });
  });

  describe('the quest mark a fresh body wears', () => {
    const GOSSIP = 1 << 0;

    it('draws no quest mark before the server has said anything', async () => {
      // The quest-giver flag describes the NPC, not this player's business
      // with it. Five real trainers stand at the map-1 hub, all flagged, and
      // a Ranger has one quest between them: drawing the flag marked all
      // five. `questMark` starts at `none`, and the per-body sweep that
      // follows the spawn is what puts a mark back on.
      const { entity } = await withBody({ offersQuests: true });

      expect(entity.questMark).toBe('none');
      expect(entity.interactionIcon).toBeUndefined();
    });

    it("keeps a flagged giver's other service icon while it has no quest for this player", async () => {
      const { entity } = await withBody({ offersQuests: true, npcFlags: GOSSIP });

      expect(entity.interactionIcon).toBe('ui/icons/head/ui_head_chat.png');
    });

    it('takes the mark the server sends, and drops it again on none', async () => {
      const { w, entity } = await withBody({ offersQuests: true, npcFlags: GOSSIP });

      w.setQuestStatus(entity, 'available');
      expect(entity.interactionIcon).toBe('ui/icons/head/ui_head_questavailable.png');

      w.setQuestStatus(entity, 'finished');
      expect(entity.interactionIcon).toBe('ui/icons/head/ui_head_questfinished.png');

      // Handed in, nothing left here: back to the gossip bubble it wore
      // before any of this, not a stale "!".
      w.setQuestStatus(entity, 'none');
      expect(entity.interactionIcon).toBe('ui/icons/head/ui_head_chat.png');
    });
  });
});

describe('walking, running, and how fast the clip plays', () => {
  /*
   * Walk below half the body's run speed (else the player's); clip rate is
   * the larger of speed over sent speed and haste, clamped to [1, 2].
   */
  it('walks below half the run speed and runs from half up', () => {
    // No run speed of its own: judged against the player's 6.
    expect(gaitFor(2.9, undefined)).toBe('walk');
    expect(gaitFor(3, undefined)).toBe('run');
    expect(gaitFor(0.1, undefined)).toBe('walk');
  });

  it('judges a body with its own run speed against that speed', () => {
    expect(gaitFor(4.9, 10)).toBe('walk');
    expect(gaitFor(5, 10)).toBe('run');
    // A slow creature charging at its full run is running, not scurrying.
    expect(gaitFor(2, 4)).toBe('run');
  });

  it('plays a body moving at the speed it was sent at rate 1', () => {
    expect(clipRateFor(4, 4)).toBe(1);
    expect(clipRateFor(9, 9)).toBe(1);
  });

  it('never slows a clip below its own pace', () => {
    expect(clipRateFor(2, 4)).toBe(1);
    expect(clipRateFor(0.5, 4)).toBe(1);
    expect(clipRateFor(4, 4, -0.5)).toBe(1);
  });

  it('speeds the clip up by how far the body outpaces its speed, up to twice', () => {
    expect(clipRateFor(6, 4)).toBeCloseTo(1.5, 5);
    expect(clipRateFor(100, 4)).toBe(2);
  });

  it('takes the haste as a floor under the rate', () => {
    expect(clipRateFor(4, 4, 0.5)).toBeCloseTo(1.5, 5);
    expect(clipRateFor(7, 4, 0.5)).toBeCloseTo(1.8, 5);
    expect(clipRateFor(4, 4, 3)).toBe(2);
  });

  it('rounds the rate to tenths, so small speed changes do not restart the clip', () => {
    expect(clipRateFor(4.1, 4)).toBe(1);
    expect(clipRateFor(4.3, 4)).toBeCloseTo(1.1, 10);
  });

  it('plays at rate 1, or the haste, when the server never said how fast the body is', () => {
    expect(clipRateFor(5, undefined)).toBe(1);
    expect(clipRateFor(5, 0)).toBe(1);
    expect(clipRateFor(5, undefined, 0.3)).toBeCloseTo(1.3, 10);
  });
});

describe('where a walk actually ends', () => {
  /*
   * A body walks the path and then moves to the sync position the same
   * message carried, which is how a creature returning home ends up back on
   * its spawn rather than a stride short of it.
   */
  it('finishes on the sync position the message carried', async () => {
    const { bodies, entity } = await withBody();
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        moving: true,
        speed: 4,
        path: [{ x: 0, y: 0, z: 10 }],
        target: [0.4, 0, 10.6],
      },
    });
    // Not the last node: the route gets the body close, the sync position is
    // where the server wants it to come to rest.
    expect(entity.network!.target[0]).toBeCloseTo(0.4, 5);
    expect(entity.network!.target[2]).toBeCloseTo(10.6, 5);
  });

  it('keeps the route’s own end when the sync position disagrees with it', async () => {
    // `target` is the controller's intent and a body told to stop still
    // carries one. A target a zone away from the route is a different
    // instruction, not a settle, and following it would snap the NPC.
    const { bodies, entity } = await withBody();
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        moving: true,
        speed: 4,
        path: [{ x: 0, y: 0, z: 10 }],
        target: [200, 0, 200],
      },
    });
    expect(entity.network!.target).toEqual([0, 0, 10]);
  });

  it('travels at the base speed times one plus its increment', async () => {
    // The increment is signed, so ignoring it moves a slowed body too fast.
    const { bodies, entity } = await withBody();
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        moving: true,
        speed: 4,
        speedBonus: -0.25,
        path: [{ x: 0, y: 0, z: 40 }],
      },
    });
    expect(entity.network!.speed).toBeCloseTo(3, 5);
    // And the base is kept, because that is what the clip is timed against.
    expect(entity.network!.baseSpeed).toBeCloseTo(4, 5);
  });

  it('times the clip against the speed the movement message gave', async () => {
    const { bodies, entity } = await withBody();
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        moving: true,
        speed: 4,
        speedBonus: 0.5,
        path: [{ x: 0, y: 0, z: 40 }],
      },
    });
    // Travelling at 6 against a base of 4 is one and a half times over.
    expect(entity.network!.speed).toBeCloseTo(6, 5);
    expect(
      clipRateFor(entity.network!.speed, entity.network!.baseSpeed, entity.network!.speedBonus),
    ).toBeCloseTo(1.5, 5);
  });
});

describe('death', () => {
  /*
   * A creature killed mid-route must not finish the route: if the death
   * message stopped only the animation, the walk would run on underneath it
   * and the corpse would slide away to wherever the path ended. Three
   * separate things have to stop.
   */
  it('stops the corpse where it fell and drops the route it was walking', async () => {
    const { w, bodies, entity } = await withBody();

    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        moving: true,
        speed: 4,
        path: [{ x: 0, y: 0, z: 40 }],
      },
    });
    expect(entity.network?.kind).toBe('route');

    bodies.take({ kind: 'dead', networkId: 1, position: [3, 0, 7] });

    // Where the server says it died, not where the walk was going.
    expect(entity.position[0]).toBeCloseTo(3, 5);
    expect(entity.position[2]).toBeCloseTo(7, 5);
    expect(entity.network).toBeUndefined();
    expect(entity.networkMoving).toBe(false);

    // And the interpolator has nothing left to replay.
    w.updateNetwork(1);
    expect(entity.position[2]).toBeCloseTo(7, 5);
  });

  it('ignores movement that arrives after the death message', async () => {
    const { w, bodies, entity } = await withBody();
    bodies.take({ kind: 'dead', networkId: 1, position: [3, 0, 7] });

    // A message still in flight behind the death, or a far-ring position
    // sync afterwards. Neither may restart the corpse.
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 40],
        moving: true,
        speed: 4,
      },
    });

    expect(entity.network).toBeUndefined();
    w.updateNetwork(1);
    expect(entity.position[2]).toBeCloseTo(7, 5);
  });

  it('takes the death message once, however many times the server sends it', async () => {
    const { bodies, entity } = await withBody();
    bodies.take({ kind: 'dead', networkId: 1, position: [3, 0, 7] });
    // The server sends this twice for the same body; the second must not
    // move the corpse again or replay the death animation.
    bodies.take({ kind: 'dead', networkId: 1, position: [99, 0, 99] });
    expect(entity.position[0]).toBeCloseTo(3, 5);
  });

  it('still marks a body dead when the message carries no position', async () => {
    const { bodies, entity } = await withBody();
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        moving: true,
        speed: 4,
        path: [{ x: 0, y: 0, z: 40 }],
      },
    });
    bodies.take({ kind: 'dead', networkId: 1 });
    expect(entity.network).toBeUndefined();
    expect(entity.position[2]).toBeCloseTo(0, 5);
  });
});

describe('turning a movement message into motion', () => {
  it('replays a creature route at the speed the server gave', async () => {
    const { bodies, entity } = await withBody();

    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        moving: true,
        speed: 4,
        path: [
          { x: 0, y: 0, z: 10 },
          { x: 0, y: 0, z: 20 },
        ],
      },
    });

    expect(entity.network?.kind).toBe('route');
    expect(entity.network?.speed).toBe(4);
    expect(entity.network?.path).toEqual([
      [0, 0, 10],
      [0, 0, 20],
    ]);
    // No facing ever crossed the wire for this body, so it faces its travel.
    expect(entity.network?.faceTravel).toBe(true);
  });

  it('drops the route nodes the server has already walked', async () => {
    const { bodies, entity } = await withBody();

    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        moving: true,
        speed: 4,
        pathStep: 1,
        path: [
          { x: 0, y: 0, z: 10 },
          { x: 0, y: 0, z: 20 },
        ],
      },
    });

    expect(entity.network?.path).toEqual([[0, 0, 20]]);
  });

  it('makes a player who reported a speed one leg of a walk, not a route', async () => {
    const { bodies, entity } = await withBody({ entry: 0 });

    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 3],
        orientation: 0,
        moving: true,
        speed: 6,
        velocity: [0, 0, 6],
      },
    });

    // Walked at their pace, but arriving proves nothing about whether they
    // stopped — only their next message does.
    expect(entity.network?.kind).toBe('segment');
    expect(entity.network?.path).toEqual([[0, 0, 3]]);
  });

  it('eases toward a bare position that says nothing about movement', async () => {
    const { bodies, entity } = await withBody({ entry: 0 });

    bodies.take({ kind: 'moved', move: { networkId: 1, position: [5, 0, 5] } });

    expect(entity.network?.kind).toBe('reported');
    expect(entity.network?.path).toEqual([]);
  });

  it('stops the body where the server says rather than where the path ends', async () => {
    const { bodies, entity } = await withBody();

    // A creature told to stop still carries the target its controller meant.
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [1, 0, 1],
        moving: false,
        target: [99, 0, 99],
      },
    });

    expect(entity.network?.path).toEqual([]);
    expect(entity.network?.target).toEqual([1, 0, 1]);
  });
});

describe('whose facing wins', () => {
  it('keeps a player facing where they said once a sync omits it', async () => {
    const { bodies, entity } = await withBody({ entry: 0 });

    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 1],
        orientation: 1.2,
        moving: true,
        speed: 6,
      },
    });
    const said = entity.network?.yaw;
    expect(said).toBeCloseTo(gameYaw(1.2), 6);

    // The far-ring sync carries no facing. Treating that as "work it out from
    // travel" turned a reversing player to face their direction of travel.
    bodies.take({ kind: 'moved', move: { networkId: 1, position: [0, 0, 2] } });
    expect(entity.network?.yaw).toBeCloseTo(said!, 6);
    expect(entity.network?.faceTravel).toBe(false);
  });

  it('lets a stopped body face home instead of freezing its arrival heading', async () => {
    const { bodies, entity } = await withBody();

    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        orientation: 1.2,
        moving: true,
        speed: 3,
      },
    });
    expect(entity.network?.yaw).toBeCloseTo(gameYaw(1.2), 6);

    // A leg arrival asserts stopped and carries no facing. Inheriting the
    // last one here pinned the arrival heading forever, so a body that
    // walked home never turned back to face home.
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [4, 0, 4],
        moving: false,
      },
    });
    expect(entity.network?.yaw).toBeUndefined();
  });

  it('faces a creature along its travel, because its message never carries one', async () => {
    const { bodies, entity } = await withBody();

    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 5],
        moving: true,
        speed: 3,
      },
    });

    expect(entity.network?.yaw).toBeUndefined();
    expect(entity.network?.faceTravel).toBe(true);
  });
});

describe('changing what a body is wearing', () => {
  it('re-resolves the look from the spawn, with only the equipment replaced', async () => {
    const w = world();
    const asked: Array<Record<string, unknown>> = [];
    const view = views();
    const bodies = new NetworkBodies(
      w,
      view,
      lookups({
        networkAppearance: async input => {
          asked.push({ ...input });
          return { model: 'wolf.bdae', scale: 1, appearance: look('armed') };
        },
      }),
    );
    bodies.open();
    // A character, not a creature: `entry` 0 is what carries an appearance.
    bodies.take({
      kind: 'spawned',
      snapshot: snapshot({ entry: 0, race: 1, gender: 1, equipment: [0, 0] }),
    });
    await Promise.resolve();
    await Promise.resolve();
    const entity = [...w.entities.values()][0]!;

    bodies.take({ kind: 'appearance', networkId: 1, equipment: [25, 0] });
    await Promise.resolve();
    await Promise.resolve();

    // Everything but the equipment comes from the spawn — the change message
    // carries the equipment alone.
    expect(asked[1]).toEqual({ ...asked[0], equipment: [25, 0] });
    expect(entity.appearance?.key).toBe('armed');
    expect(view.refreshAppearance).toHaveBeenCalledWith(entity);
  });

  it('hands a body it does not own to the fallback, because that one is the player', async () => {
    const w = world();
    const unowned = vi.fn();
    const bodies = new NetworkBodies(w, views(), lookups(), () => undefined, unowned);
    bodies.open();

    bodies.take({ kind: 'appearance', networkId: 7, equipment: [25] });
    await Promise.resolve();

    expect(unowned).toHaveBeenCalledWith(7, [25], undefined);
    expect(w.entities.size).toBe(0);
  });

  it('applies a change queued across a zone load once the body is back', async () => {
    const w = world();
    const unowned = vi.fn();
    const view = views();
    const bodies = new NetworkBodies(
      w,
      view,
      lookups({
        networkAppearance: async input => ({
          model: 'wolf.bdae',
          scale: 1,
          appearance: look(input.equipment.join('/')),
        }),
      }),
      () => undefined,
      unowned,
    );

    // The order a zone entry actually arrives in: the server re-describes
    // everyone in range, and a change can land in the same held batch.
    bodies.take({ kind: 'spawned', snapshot: snapshot({ entry: 0, equipment: [0] }) });
    bodies.take({ kind: 'appearance', networkId: 1, equipment: [25] });
    bodies.open();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const entity = [...w.entities.values()][0]!;
    expect(entity.appearance?.key).toBe('25');
    expect(view.refreshAppearance).toHaveBeenCalledWith(entity);
    expect(unowned).not.toHaveBeenCalled();
  });

  it('drops a replayed change for a body that the zone reset took away', async () => {
    const w = world();
    const unowned = vi.fn();
    const bodies = new NetworkBodies(w, views(), lookups(), () => undefined, unowned);
    bodies.open();
    bodies.take({ kind: 'spawned', snapshot: snapshot({ entry: 0 }) });
    await Promise.resolve();
    await Promise.resolve();

    // Held across the load, but nothing re-describes that body: it belonged to
    // the zone just left. Reading it as the player's would dress them in a
    // stranger's equipment, so it goes nowhere.
    bodies.close();
    bodies.take({ kind: 'appearance', networkId: 1, equipment: [25] });
    bodies.open();
    await Promise.resolve();
    await Promise.resolve();

    expect(unowned).not.toHaveBeenCalled();
  });
});

/**
 * The ground pass: it runs whenever any tile changes, so it must not leave
 * the interpolator easing bodies back to the server's Y, or every NPC dips.
 */
describe('putting bodies down on the ground', () => {
  /** A standing body whose server Y sits `off` above what the client resolves. */
  async function standingAt(groundY: number, off: number) {
    const { w, bodies, entity } = await withBody();
    w.setPosition(entity, 0, groundY + off, 0);
    entity.network = {
      kind: 'reported',
      target: [0, groundY + off, 0],
      path: [],
      speed: 0,
      moving: false,
    };
    entity.networkMoving = false;
    vi.spyOn(w, 'restingHeight').mockReturnValue({ y: groundY, swimming: false });
    vi.spyOn(w.terrain, 'heightAt').mockReturnValue(groundY);
    return { w, bodies, entity };
  }

  /**
   * Ground is searched from a step above a body downwards, so where nothing
   * is found the answer falls back to the heightmap. Indoors that is the
   * field the building stands on, a storey below the floor the body is
   * walking along — and once a body is under its own floor, the floor is
   * above the search and can never be found again. Every later settle drops
   * it again and the body sinks out of the world a tick at a time.
   */
  it('does not drop a body a storey onto the heightmap under its floor', async () => {
    // Standing on an interior floor at twelve; the heightmap knows only the
    // field at zero, and no collision has been found under this point.
    const { bodies, entity } = await standingAt(0, 12);
    bodies.settle();
    expect(entity.position[1]).toBeCloseTo(12, 5);
  });

  it('still puts a body down a real step', async () => {
    const { bodies, entity } = await standingAt(10, 1);
    bodies.settle();
    expect(entity.position[1]).toBeCloseTo(10, 5);
  });

  it('puts a body down on the ground the client actually has', async () => {
    const { bodies, entity } = await standingAt(10, 0.03);
    bodies.settle();
    expect(entity.position[1]).toBeCloseTo(10, 5);
  });

  it('does not let the interpolator undo the ground it just picked', async () => {
    const { w, bodies, entity } = await standingAt(10, 0.03);
    bodies.settle();
    expect(entity.position[1]).toBeCloseTo(10, 5);

    // This is the bug: a frame of interpolation pulled it back toward the
    // server's Y, and the next tile stream pushed it down again.
    for (let i = 0; i < 30; i++) w.updateNetwork(1 / 60);
    expect(entity.position[1]).toBeCloseTo(10, 4);
  });

  it('holds still across repeated ground revisions', async () => {
    // Every tile arriving or leaving bumps the revision, so this is what
    // walking through a city looks like to a standing NPC.
    const { w, bodies, entity } = await standingAt(10, 0.03);
    const seen: number[] = [];
    for (let tick = 0; tick < 20; tick++) {
      if (tick % 5 === 0) w.dropTile(99, 99); // bumps groundRevision
      w.updateNetwork(1 / 60);
      bodies.settle();
      seen.push(entity.position[1]);
    }
    for (const y of seen) expect(y).toBeCloseTo(10, 4);
  });

  it('still follows the server when it reports a genuinely new height', async () => {
    // The fix must not pin a body to one height for ever: a creature that
    // walks up a stair gets a new position and has to take it.
    const { w, bodies, entity } = await standingAt(10, 0.03);
    bodies.settle();

    vi.spyOn(w, 'restingHeight').mockReturnValue({ y: 14, swimming: false });
    vi.spyOn(w.terrain, 'heightAt').mockReturnValue(14);
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 14, 0],
        moving: false,
        speed: 0,
        path: [],
      },
    });
    for (let i = 0; i < 60; i++) {
      w.updateNetwork(1 / 60);
      bodies.settle();
    }
    expect(entity.position[1]).toBeCloseTo(14, 2);
  });

  it('leaves an airborne body alone', async () => {
    // A jump's Y is airborne on purpose — putting it on the ground mid-arc is
    // the one thing this pass must never do.
    const { bodies, entity } = await standingAt(10, 5);
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 15, 0],
        moving: false,
        speed: 0,
        path: [],
        state: EntityMovementState.Jumping,
      },
    });
    bodies.settle();
    expect(entity.position[1]).toBeCloseTo(15, 5);
  });
});

/*
 * A position sync is not a stop: under half a unit the body takes the
 * position and stands; beyond it the position is a destination, moving forward.
 */
describe('a creature corrected toward something it is chasing', () => {
  it('walks to a sync position that is a real distance away', async () => {
    const { bodies, entity } = await withBody();

    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 6],
        moving: false,
        speed: 4,
        state: EntityMovementState.Standing,
      },
    });

    // A route with the sync position on the end of it, not a standing body
    // being dragged there.
    expect(entity.network?.path).toEqual([[0, 0, 6]]);
    expect(entity.networkMoving).toBe(true);
    // And a posture the clip layer reads as travelling. Without this it plays
    // `idle` over the walk, which is the glide.
    expect(bodies.report()[0]!.posture).toBe('run');
  });

  it('stands still for a correction inside half a unit', async () => {
    const { bodies, entity } = await withBody();

    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, SYNC_WALK_MIN / 2],
        moving: false,
        speed: 4,
        state: EntityMovementState.Standing,
      },
    });

    expect(entity.network?.path).toEqual([]);
    expect(entity.networkMoving).toBe(false);
  });

  it('does not invent a walk it has no speed to play', async () => {
    // Without a speed there is nothing to walk at: `World` would collapse the
    // route to an ease and warn, which is worse than the correction itself.
    const { bodies, entity } = await withBody();

    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 6],
        moving: false,
        state: EntityMovementState.Standing,
      },
    });

    expect(entity.network?.path).toEqual([]);
    expect(entity.networkMoving).toBe(false);
  });
});

/*
 * Which posture the movement layer is allowed to decide.
 *
 * Reading only `run` as "on its feet" meant a body whose last message called
 * it standing, and which the world is nonetheless moving, played `idle` while
 * it slid along the floor — and a body standing still in a fight never
 * reached the combat posture at all, so it dropped its guard between swings.
 */
describe('a body on its feet', () => {
  /** An open body whose every clip request is recorded. */
  async function withClips() {
    const clips: string[] = [];
    const w = world();
    const bodies = new NetworkBodies(
      w,
      views({
        setEntityClip: async (_id, clip) => {
          clips.push(clip);
        },
      }),
      lookups(),
    );
    bodies.open();
    bodies.take({ kind: 'spawned', snapshot: snapshot() });
    await Promise.resolve();
    await Promise.resolve();
    return { w, bodies, clips, entity: [...w.entities.values()][0]! };
  }

  it('holds its guard while it stands still in a fight', async () => {
    // The posture a standing body is in was not being asked what it was
    // holding at all, so an NPC between swings dropped its weapon and stood
    // in a plain idle.
    const { bodies, clips } = await withClips();
    bodies.setStance(1, 'melee');
    bodies.updateClips(1 / 60);

    expect(clips).toContain('combat_ready');
    expect(clips).not.toContain('idle');
  });

  it('aims rather than idles with a bow up', async () => {
    const { bodies, clips } = await withClips();
    bodies.setStance(1, 'ranged');
    bodies.updateClips(1 / 60);
    // Two clips, unlike the melee guard: `combat_load` nocks the arrow once
    // and `combat_aim` holds it there, so the one-shot comes first.
    expect(clips).toContain('combat_load');
    expect(clips).not.toContain('idle');
  });

  it('animates the travel rather than sliding through it', async () => {
    const { bodies, clips, entity } = await withClips();
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 20],
        moving: true,
        speed: 5,
      },
    });
    bodies.updateClips(1 / 60);

    expect(entity.networkMoving).toBe(true);
    expect(clips).toContain('run_normal');
    expect(clips).not.toContain('idle');
  });
});

describe('the values a body carries', () => {
  it('takes level, health and power under the names the server sends', async () => {
    const { bodies, entity } = await withBody();
    bodies.updateValues({
      networkId: 1,
      values: { level: 12, health: 40, maxHealth: 90, power: 5, maxPower: 30 },
    });
    expect(entity.networkLevel).toBe(12);
    expect(entity.networkHealth).toBe(40);
    expect(entity.networkMaxHealth).toBe(90);
    expect(entity.networkPower).toBe(5);
    expect(entity.networkMaxPower).toBe(30);
  });

  it('leaves a value the batch did not name alone', async () => {
    const { bodies, entity } = await withBody();
    bodies.updateValues({ networkId: 1, values: { health: 40, maxHealth: 90 } });
    bodies.updateValues({ networkId: 1, values: { health: 12 } });
    expect(entity.networkHealth).toBe(12);
    expect(entity.networkMaxHealth).toBe(90);
  });
});

describe('a body standing about', () => {
  /** An open body whose every clip request is recorded, with the draw pinned low. */
  async function standing(over: Partial<EntitySnapshot> = {}, resting?: string) {
    const clips: string[] = [];
    const w = world();
    const bodies = new NetworkBodies(
      w,
      views({
        setEntityClip: async (_id, clip) => {
          clips.push(clip);
        },
      }),
      lookups({
        networkAppearance: async () => ({ model: 'wolf.bdae', scale: 1, animationName: resting }),
      }),
      undefined,
      undefined,
      () => 0,
    );
    bodies.open();
    bodies.take({ kind: 'spawned', snapshot: snapshot(over) });
    await Promise.resolve();
    await Promise.resolve();
    return { bodies, clips };
  }

  function run(bodies: NetworkBodies, seconds: number): void {
    for (let t = 0; t < seconds; t += 1 / 60) bodies.updateClips(1 / 60);
  }

  it('stands playing what its placement is doing instead of idle', async () => {
    const { bodies, clips } = await standing({}, 'sit_wait');
    run(bodies, 1);
    expect(clips).toEqual(['sit_wait']);
  });

  it('breaks up a long idle with an idle variation, then goes back to idle', async () => {
    const { bodies, clips } = await standing();
    run(bodies, FIDGET_WAIT.min + 1.5);
    // `clipLength` is 1 s in these views, so the fidget has run down.
    expect(clips).toEqual(['idle', FIDGET_CLIPS[0], 'idle']);
  });

  it('does not fidget out of what its placement is doing', async () => {
    const { bodies, clips } = await standing({}, 'emote_work');
    run(bodies, FIDGET_WAIT.max + 1);
    expect(clips).toEqual(['emote_work']);
  });

  it('leaves another player standing still', async () => {
    const { bodies, clips } = await standing({ entry: 0, race: 1 });
    run(bodies, FIDGET_WAIT.max + 1);
    expect(clips).toEqual(['idle']);
  });

  it("lets a lost duel's begging play out through the guard coming down and the health that follows", async () => {
    // The loser's body as the winner sees it: in its guard when the duel
    // ends, then the begging, then the server takes the guard down and
    // restores its health. `clipLength` is 1 s in these views.
    const { bodies, clips } = await standing({ entry: 0, race: 1 });
    bodies.setStance(1, 'melee');
    run(bodies, 0.5);
    bodies.gesture(1, 'emote_beg');
    run(bodies, 0.1);
    bodies.setStance(1, null);
    bodies.updateValues({ networkId: 1, values: { health: 10, maxHealth: 200 } });
    run(bodies, 0.6);
    expect(clips).toEqual(['combat_ready', 'emote_beg']);
    run(bodies, 0.5);
    expect(clips).toEqual(['combat_ready', 'emote_beg', 'idle']);
  });

  it("plays a quest giver's gesture once, then returns to what it was doing", async () => {
    const { bodies, clips } = await standing({}, 'emote_talk');
    run(bodies, 0.5);
    bodies.gesture(1, QUEST_GESTURES.accepted);
    run(bodies, 1.5);
    expect(clips).toEqual(['emote_talk', QUEST_GESTURES.accepted, 'emote_talk']);
  });
});

describe('telling when a creature comes to a stop', () => {
  it('reports a creature that walked its path out once, and only once', async () => {
    const { w, bodies } = await withBody();
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        moving: true,
        speed: 4,
        path: [{ x: 0, y: 0, z: 2 }],
      },
    });
    bodies.updateClips(1 / 60);
    expect(bodies.takeStopped()).toEqual([]);
    for (let i = 0; i < 120; i++) w.updateNetwork(1 / 30);
    bodies.updateClips(1 / 60);
    expect(bodies.takeStopped()).toEqual([1]);
    bodies.updateClips(1 / 60);
    expect(bodies.takeStopped()).toEqual([]);
  });

  it('does not count one pulled up by a fight', async () => {
    const { w, bodies, entity } = await withBody();
    bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 0],
        moving: true,
        speed: 4,
        path: [{ x: 0, y: 0, z: 2 }],
      },
    });
    bodies.updateClips(1 / 60);
    entity.networkInCombat = true;
    for (let i = 0; i < 120; i++) w.updateNetwork(1 / 30);
    bodies.updateClips(1 / 60);
    expect(bodies.takeStopped()).toEqual([]);
  });
});
