import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Looting, type HeroClips } from '../src/app/features/loot/looting';
import type { GameConnection, LootContents, LootRow } from '../src/net/GameConnection';
import { LOOT_HOLD_CLIP, LOOT_START_CLIP } from '../src/gameplay/actionClips';
import {
  closeLoot,
  lootActions,
  lootWindow,
  setLootActions,
  setLootContents,
} from '../src/ui/lootStore';

const INERT = lootActions();

const row = (slot: number, entry = 11): LootRow =>
  ({ slot, itemId: `i${slot}`, entry, itemClass: 0, subClass: 1 }) as LootRow;
const contents = (over: Partial<LootContents> = {}): LootContents => ({
  networkId: 100,
  money: 5,
  items: [row(0), row(1, 12)],
  ...over,
});

function setup() {
  const connection = {
    sendLootTake: vi.fn(),
    sendLootTakeMoney: vi.fn(),
    sendLootClose: vi.fn(),
  };
  const art = { resolveLootArt: vi.fn() };
  const played: string[] = [];
  const audio = { play: (name: string) => (played.push(name), null) };
  const poses: string[] = [];
  const hero: HeroClips = {
    play: (clip, options) => poses.push(`play ${clip} ${options.hold}/${options.allBody}`),
    stop: () => poses.push('stop'),
  };
  const looting = new Looting(connection as unknown as GameConnection, art, audio, hero);
  looting.installActions();
  return { looting, h: looting.handlers(), connection, art, played, poses };
}

beforeEach(() => {
  closeLoot();
  setLootActions(INERT);
});

describe('Looting handlers', () => {
  it('opens the window on contents, kneels, and draws every row’s art', () => {
    const { h, art, poses } = setup();
    h.onLootContents!(contents());
    expect(lootWindow.value?.networkId).toBe(100);
    expect(poses).toEqual([
      `play ${LOOT_START_CLIP} true/true`,
      `play ${LOOT_HOLD_CLIP} true/true`,
    ]);
    expect(art.resolveLootArt.mock.calls).toEqual([[11], [12]]);
  });

  it('does not kneel over an empty answer, which closes the window', () => {
    const { h, poses } = setup();
    h.onLootContents!(contents());
    poses.length = 0;
    h.onLootContents!(contents({ money: 0, items: [] }));
    expect(lootWindow.value).toBeNull();
    expect(poses).toEqual(['stop']);
  });

  it('stands the hero up when the container goes free, only if it was the open one', () => {
    const { h, poses } = setup();
    h.onLootContents!(contents());
    poses.length = 0;
    h.onLootBusy!(999, false);
    expect(lootWindow.value).not.toBeNull();
    expect(poses).toEqual([]);
    h.onLootBusy!(100, true);
    expect(lootWindow.value).not.toBeNull();
    h.onLootBusy!(100, false);
    expect(lootWindow.value).toBeNull();
    expect(poses).toEqual(['stop']);
  });

  it('takes a row or the coin off the window on the server’s word, standing up when it empties', () => {
    const { h, poses } = setup();
    h.onLootContents!(contents());
    poses.length = 0;
    h.onLootItemRemoved!(100, 1, false, 0);
    expect(lootWindow.value?.items.map(r => r.slot)).toEqual([1]);
    h.onLootItemRemoved!(100, 1, true, undefined);
    expect(lootWindow.value?.money).toBe(0);
    expect(poses).toEqual([]);
    h.onLootItemRemoved!(100, 1, false, 1);
    expect(lootWindow.value).toBeNull();
    expect(poses).toEqual(['stop']);
  });
});

describe('Looting actions', () => {
  it('asks for a row and sounds it being picked up; nothing for a row it does not hold', () => {
    const { connection, played } = setup();
    setLootContents(contents());
    lootActions().take(100, 1);
    expect(connection.sendLootTake).toHaveBeenCalledWith(100, 1);
    expect(played).toEqual(['sfx_ui_pickup_potion']);
    lootActions().take(100, 9);
    expect(connection.sendLootTake).toHaveBeenCalledWith(100, 9);
    expect(played).toHaveLength(1);
  });

  it('asks for the coin with the coin’s sound', () => {
    const { connection, played } = setup();
    lootActions().takeMoney(100);
    expect(connection.sendLootTakeMoney).toHaveBeenCalledWith(100);
    expect(played).toEqual(['sfx_ui_pickup_money']);
  });

  it('closes by asking, and stands the hero up without waiting for the answer', () => {
    const { connection, poses } = setup();
    lootActions().close(100);
    expect(connection.sendLootClose).toHaveBeenCalledWith(100);
    expect(poses).toEqual(['stop']);
  });
});
