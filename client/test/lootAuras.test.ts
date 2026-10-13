import { describe, expect, it, vi } from 'vitest';
import { LootAuras } from '../src/app/features/loot/lootAuras';
import type { Entity } from '../src/world/World';

function setup() {
  const entities = new Map<number, Partial<Entity>>([[10, { id: 10 }]]);
  const network = new Map<number, number>([[100, 10]]);
  const whoIs = {
    localIdOf: (networkId: number) => network.get(networkId),
    entity: (id: number) => entities.get(id) as Entity | undefined,
  };
  const combat = { showLootGlow: vi.fn(), hideLootGlow: vi.fn() };
  const auras = new LootAuras(whoIs, combat);
  return { auras, h: auras.handlers(), entities, network, combat };
}

describe('LootAuras', () => {
  it('marks the body and lights it when the server says it can be opened', () => {
    const { h, entities, combat } = setup();
    h.onEntityLootable!(100, 'lootable');
    expect(entities.get(10)!.networkLootable).toBe('lootable');
    expect(combat.showLootGlow).toHaveBeenCalledWith(100);
    expect(combat.hideLootGlow).not.toHaveBeenCalled();
  });

  it('takes the glow away from a body that is not worth opening, whichever state says so', () => {
    const { h, combat } = setup();
    h.onEntityLootable!(100, 'emptied');
    h.onEntityLootable!(100, 'none');
    expect(combat.hideLootGlow).toHaveBeenCalledTimes(2);
    expect(combat.showLootGlow).not.toHaveBeenCalled();
  });

  it('treats an unknown state as openable', () => {
    const { h, combat } = setup();
    h.onEntityLootable!(100, 'unknown');
    expect(combat.showLootGlow).toHaveBeenCalledWith(100);
  });

  it('keeps the state of a body that is not here yet, and shows it when it arrives', () => {
    const { auras, h, entities, network, combat } = setup();
    h.onEntityLootable!(200, 'lootable');
    expect(auras.recorded.get(200)).toBe('lootable');
    auras.sync();
    expect(combat.showLootGlow).toHaveBeenCalledTimes(1); // the first call, from the message

    combat.showLootGlow.mockClear();
    entities.set(20, { id: 20 });
    network.set(200, 20);
    auras.sync();
    expect(entities.get(20)!.networkLootable).toBe('lootable');
    expect(combat.showLootGlow).toHaveBeenCalledWith(200);
  });

  it('asks for each body’s glow once per frame loop, not every frame', () => {
    const { auras, h, combat } = setup();
    h.onEntityLootable!(100, 'lootable');
    combat.showLootGlow.mockClear();
    auras.sync();
    auras.sync();
    auras.sync();
    expect(combat.showLootGlow).toHaveBeenCalledTimes(1);
  });

  it('may earn the glow again after it stopped being worth opening', () => {
    const { auras, h, combat } = setup();
    h.onEntityLootable!(100, 'lootable');
    auras.sync();
    h.onEntityLootable!(100, 'emptied');
    h.onEntityLootable!(100, 'lootable');
    combat.showLootGlow.mockClear();
    auras.sync();
    expect(combat.showLootGlow).toHaveBeenCalledTimes(1);
  });

  it('forgets a body whose id is reused, and everything on a zone change', () => {
    const { auras, h } = setup();
    h.onEntityLootable!(100, 'lootable');
    h.onEntityLootable!(101, 'lootable');
    auras.forget(100);
    expect([...auras.recorded.keys()]).toEqual([101]);
    auras.clear();
    expect(auras.recorded.size).toBe(0);
  });
});
