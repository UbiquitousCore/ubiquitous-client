import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LootOpener, type LootAttemptRecord } from '../src/app/features/loot/lootOpener';
import { banner } from '../src/gameplay/SpellBook';
import type { Entity } from '../src/world/World';

function setup(
  over: { here?: [number, number, number] | null; own?: boolean; relation?: string } = {},
) {
  const corpse = { id: 10, kind: 'creature', entry: 77 } as Entity;
  const whoIs = {
    entity: (id: number) => (id === 10 ? corpse : undefined),
    networkIdOf: (id: number) => (id === 10 ? 100 : undefined),
    heroPosition: () => (over.here === undefined ? [0, 0, 0] : over.here) as never,
    positionOf: (networkId: number) =>
      networkId === 100 ? ([3, 4, 0] as [number, number, number]) : null,
    isOwnBody: () => over.own ?? false,
    relationTo: () => (over.relation ?? 'corpse') as never,
  };
  const connection = { sendLootOpen: vi.fn() };
  const records: LootAttemptRecord[] = [];
  const opener = new LootOpener(connection, whoIs, a => records.push(a), 10);
  return { opener, connection, records };
}

beforeEach(() => {
  banner.value = null;
});

describe('LootOpener.open', () => {
  it('asks to open a dead body in reach, and records that it did', () => {
    const { opener, connection, records } = setup();
    expect(opener.open(10)).toBe(true);
    expect(connection.sendLootOpen).toHaveBeenCalledWith(100);
    expect(records).toEqual([{ networkId: 100, entry: 77, distance: 5, why: 'sent', sent: true }]);
  });

  it('asks nothing of a body too far away, and says so', () => {
    const { opener, connection, records } = setup({ here: [30, 0, 0] });
    expect(opener.open(10)).toBe(false);
    expect(connection.sendLootOpen).not.toHaveBeenCalled();
    expect(records[0]).toMatchObject({ networkId: 100, why: 'too far', sent: false });
    expect(banner.value?.text).toBe('Too far away to loot');
  });

  it('refuses silently what is not dead, and records why', () => {
    const { opener, connection, records } = setup({ relation: 'enemy' });
    expect(opener.open(10)).toBe(false);
    expect(connection.sendLootOpen).not.toHaveBeenCalled();
    expect(records).toEqual([
      { networkId: 100, entry: 77, distance: null, why: 'not dead', sent: false },
    ]);
    expect(banner.value).toBeNull();
  });

  it('never opens the hero’s own body', () => {
    const { opener, records } = setup({ own: true });
    expect(opener.open(10)).toBe(false);
    expect(records[0]!.why).toBe('own body');
  });

  it('records a click on something the world no longer holds, with no ids', () => {
    const { opener, records } = setup();
    expect(opener.open(999)).toBe(false);
    expect(records).toEqual([
      { networkId: 0, entry: 0, distance: null, why: 'no such body', sent: false },
    ]);
  });

  it('opens a body whose distance is unknown: the server decides', () => {
    const { opener, connection, records } = setup({ here: null });
    expect(opener.open(10)).toBe(true);
    expect(connection.sendLootOpen).toHaveBeenCalledWith(100);
    expect(records[0]!.distance).toBeNull();
  });
});
