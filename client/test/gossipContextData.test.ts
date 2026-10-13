import { describe, expect, it } from 'vitest';

import { buildGossipContextData } from '../src/app/helpers/npc/gossipContextData';

describe('buildGossipContextData', () => {
  it('builds context from character/kinds and quest/aura predicates', () => {
    const out = buildGossipContextData({
      character: { name: 'Ari', class: 2, race: 4 } as never,
      kinds: { races: [{ race: 4, name: 'Elf' }], classes: [] } as never,
      classWord: id => (id === 2 ? 'Mage' : ''),
      holdsQuest: id => id === 55,
      hasAura: id => id === 77,
      random: () => 0.25,
    });

    expect(out.name).toBe('Ari');
    expect(out.className).toBe('Mage');
    expect(out.raceName).toBe('Elf');
    expect(out.holdsQuest(55)).toBe(true);
    expect(out.hasAura(77)).toBe(true);
    expect(out.random()).toBe(0.25);
  });
});
