import { describe, expect, it, vi } from 'vitest';
import { loadSpellBook } from '../src/app/helpers/spell/loadSpellBook';

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function fixture(overrides: Record<string, unknown> = {}) {
  const tables = {
    spellCastable: async (id: number) => id !== 2,
    spellStats: async (id: number) => ({
      powerCost: 0,
      castMs: 0,
      cooldownMs: 0,
      range: 0,
      mount: id === 3,
      pet: false,
      skillSet: id === 4 ? 0 : 11,
      skillSetIcon: null,
    }),
    spellName: async (id: number) => (id === 1 ? 'Bolt' : id === 4 ? 'Test Stun' : null),
    spellText: async (id: number) => (id === 1 ? 'Hits hard.' : null),
    spellIcon: async () => null,
    spellCastingTime: async (id: number) => id * 100,
    spellRank: async () => 1,
    ...overrides,
  };
  const sinks = {
    install: vi.fn(),
    mountSpells: vi.fn(),
    petSpells: vi.fn(),
    name: vi.fn(),
    text: vi.fn(),
    icon: vi.fn(),
    castTime: vi.fn(),
    rank: vi.fn(),
    stats: vi.fn(),
  };
  return { tables, sinks };
}

describe('loadSpellBook', () => {
  it('installs the bar as sent with only the castable spells in the book', async () => {
    const { tables, sinks } = fixture();
    const bar = [] as never[];
    const castable = await loadSpellBook([1, 2, 3], bar, tables, sinks);
    expect(castable).toEqual([1, 3]);
    expect(sinks.install).toHaveBeenCalledWith([1, 2, 3], bar, [1, 3]);
  });

  it('lists a GM or test spell though the bar would not take it', async () => {
    const { tables, sinks } = fixture({ spellCastable: async (id: number) => id === 1 });
    const listed = await loadSpellBook([1, 4], [], tables, sinks);
    expect(listed).toEqual([1, 4]);
    expect(sinks.stats).toHaveBeenCalledWith(4, expect.objectContaining({ skillSet: 0 }));
  });

  it('hands the mount page the known spells the tables call mounts', async () => {
    const { tables, sinks } = fixture();
    await loadSpellBook([1, 2, 3], [], tables, sinks);
    await settle();
    expect(sinks.mountSpells).toHaveBeenCalledWith([3]);
  });

  it('fills names, times and ranks per spell, and skips a name or icon the tables lack', async () => {
    const { tables, sinks } = fixture();
    await loadSpellBook([1, 2], [], tables, sinks);
    await settle();
    expect(sinks.name).toHaveBeenCalledTimes(1);
    expect(sinks.name).toHaveBeenCalledWith(1, 'Bolt');
    expect(sinks.text).toHaveBeenCalledWith(1, 'Hits hard.');
    expect(sinks.text).toHaveBeenCalledTimes(1);
    expect(sinks.icon).not.toHaveBeenCalled();
    expect(sinks.castTime).toHaveBeenCalledWith(2, 200);
    expect(sinks.rank).toHaveBeenCalledTimes(2);
  });

  it('survives a spell table that cannot be read', async () => {
    const { tables, sinks } = fixture({ spellStats: () => Promise.reject(new Error('no table')) });
    await loadSpellBook([1], [], tables, sinks);
    await settle();
    expect(sinks.install).toHaveBeenCalled();
    expect(sinks.mountSpells).toHaveBeenCalledWith([]);
  });
});
