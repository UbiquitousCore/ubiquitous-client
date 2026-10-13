import { describe, expect, it } from 'vitest';

import type { PiecePart } from '../../src/ui/art/piecePlan';
import { framedOn, heroFaces, neverDrawn, strangers } from '../../src/ui/components/ArtPlayerFrame';

const spec = {
  bars: { frames: 50, of: { health: 'face/hp', mana: 'face/mp', exp: 'face/xp' } },
  groups: {
    combat: 'fighting',
    morale: 'rageMeter',
    vigor: 'powerMeter',
    fill: 'fill',
    fillBeyond: 'fillLong',
    pip1: 'p1',
    pip2: 'p2',
    pip3: 'p3',
    pip4: 'p4',
  },
  hidden: ['face/ping'],
};

const hero = {
  health: 100,
  maxHealth: 100,
  mana: 40,
  maxMana: 80,
  exp: 50,
  expToLevel: 100,
  inCombat: false,
};

describe('heroFaces', () => {
  it('turns health, mana and experience to their faces: full first, empty last, to the nearest step', () => {
    const { frames, hidden } = heroFaces({ ...hero, resource: 'mana' }, spec);
    expect(frames['face/hp']).toBe(0);
    expect(frames['face/mp']).toBe(25);
    expect(frames['face/xp']).toBe(25);
    // A caster has no meter of their own, and is not fighting.
    expect(hidden).toEqual(
      expect.arrayContaining(['face/ping', 'fighting', 'rageMeter', 'powerMeter']),
    );
  });

  it('keeps the corner’s ornament for every hero, and leaves a meter’s own ornament out', () => {
    const marked = {
      ...spec,
      groups: {
        ...spec.groups,
        ornament: 'backdrop@2#1',
        moraleOrnaments: 'rageMeter@1 rageMeter/fill@2#2',
        vigorOrnaments: 'powerMeter@1',
      },
    };
    const hides = (resource: 'mana' | 'morale' | 'vigor') =>
      heroFaces({ ...hero, resource }, marked).hidden;
    for (const resource of ['mana', 'morale', 'vigor'] as const) {
      expect(hides(resource)).not.toContain('backdrop@2#1');
    }
    expect(hides('morale')).toEqual(expect.arrayContaining(['rageMeter@1', 'rageMeter/fill@2#2']));
    expect(hides('vigor')).toContain('powerMeter@1');
    expect(hides('vigor')).not.toContain('rageMeter/fill@2#2');
  });

  it('measures the frame without either meter’s ornament', () => {
    const marked = {
      ...spec,
      groups: {
        ...spec.groups,
        moraleOrnaments: 'rageMeter@1 rageMeter/fill@2#2',
        vigorOrnaments: 'powerMeter@1',
      },
    };
    expect(neverDrawn(marked)).toEqual([
      'face/ping',
      'rageMeter@1',
      'rageMeter/fill@2#2',
      'powerMeter@1',
    ]);
    expect(neverDrawn(spec)).toEqual(['face/ping']);
  });

  it('draws a health bar with nothing to measure against as full', () => {
    const { frames } = heroFaces({ ...hero, maxHealth: 0, resource: 'mana' }, spec);
    expect(frames['face/hp']).toBe(0);
  });

  it('draws the experience bar empty at the level cap, where there is no next level', () => {
    // The server sends no XP to fill towards at the cap, and zero held.
    const { frames } = heroFaces({ ...hero, exp: 0, expToLevel: 0, resource: 'mana' }, spec);
    expect(frames['face/xp']).toBe(50);
    // Even where an older save still holds some.
    expect(
      heroFaces({ ...hero, exp: 900, expToLevel: 0, resource: 'mana' }, spec).frames['face/xp'],
    ).toBe(50);
  });

  describe('the meter a warrior or a ranger fills', () => {
    // Two lengths of meter, each a group holding the clip that climbs and
    // its pips: the ordinary one with three, the longer with four.
    const nested = {
      ...spec,
      bars: {
        ...spec.bars,
        runs: {
          'rageMeter/fill/run': [{ first: 0, last: 40 }],
          'rageMeter/fillLong/run': [{ first: 0, last: 40 }],
        },
      },
      groups: { ...spec.groups, step: 'run' },
    };
    const parts = [
      'rageMeter',
      'rageMeter/fill',
      'rageMeter/fill/run',
      'rageMeter/fill/p1',
      'rageMeter/fill/p2',
      'rageMeter/fill/p3',
      'rageMeter/fillLong',
      'rageMeter/fillLong/run',
      'rageMeter/fillLong/p1',
      'rageMeter/fillLong/p2',
      'rageMeter/fillLong/p3',
      'rageMeter/fillLong/p4',
    ].map(path => ({
      name: path.split('/').pop()!,
      path,
      box: { x: 0, y: 0, w: 1, h: 1 },
      draws: true,
    }));
    const warrior = { ...hero, resource: 'morale' as const };

    it('wears it in place of mana, filled to the share of the top the server sends', () => {
      const { frames, hidden } = heroFaces({ ...warrior, mana: 50, maxMana: 100 }, nested, parts);
      expect(hidden).toEqual(
        expect.arrayContaining(['face/mp', 'powerMeter', 'rageMeter/fillLong']),
      );
      expect(hidden).not.toContain('rageMeter');
      expect(hidden).not.toContain('rageMeter/fill');
      // The meter climbs: empty at its first face, full at its last.
      expect(frames['rageMeter/fill/run']).toBe(20);
    });

    /** Which of a length's pips are lit, for `mana` of `maxMana`. */
    const litOf = (length: 'fill' | 'fillLong', mana: number, maxMana: number): string[] => {
      const { hidden } = heroFaces({ ...warrior, mana, maxMana }, nested, parts);
      return ['p1', 'p2', 'p3', 'p4']
        .filter(pip => parts.some(part => part.path === `rageMeter/${length}/${pip}`))
        .filter(pip => !hidden.includes(`rageMeter/${length}/${pip}`));
    };

    /** One short of `power`. */
    const under = (power: number): number => power - 1;

    it('lights the pips at 20, 50 and 100 power', () => {
      expect(litOf('fill', 0, 100)).toEqual([]);
      expect(litOf('fill', under(20), 100)).toEqual([]);
      expect(litOf('fill', 20, 100)).toEqual(['p1']);
      expect(litOf('fill', under(50), 100)).toEqual(['p1']);
      // Sixty of a hundred: two of three.
      expect(litOf('fill', 60, 100)).toEqual(['p1', 'p2']);
      expect(litOf('fill', 99, 100)).toEqual(['p1', 'p2']);
      expect(litOf('fill', 100, 100)).toEqual(['p1', 'p2', 'p3']);
    });

    it('counts power held on the longer length too, the fourth pip at 120', () => {
      expect(litOf('fillLong', 20, 120)).toEqual(['p1']);
      expect(litOf('fillLong', 50, 120)).toEqual(['p1', 'p2']);
      expect(litOf('fillLong', under(120), 120)).toEqual(['p1', 'p2', 'p3']);
      expect(litOf('fillLong', 120, 120)).toEqual(['p1', 'p2', 'p3', 'p4']);
      // The marks do not move with the top.
      expect(litOf('fillLong', 110, 150)).toEqual(['p1', 'p2', 'p3']);
      expect(litOf('fillLong', 150, 150)).toEqual(['p1', 'p2', 'p3', 'p4']);
    });

    it('wears the shortest length with a pip for every mark the top reaches', () => {
      for (const maxMana of [0, 50, under(100), 100, 100 + 1, under(120)]) {
        const { hidden } = heroFaces({ ...warrior, mana: 0, maxMana }, nested, parts);
        expect(hidden).toContain('rageMeter/fillLong');
        expect(hidden).not.toContain('rageMeter/fill');
      }
      for (const maxMana of [120, 200]) {
        const { hidden } = heroFaces({ ...warrior, mana: 0, maxMana }, nested, parts);
        expect(hidden).toContain('rageMeter/fill');
        expect(hidden).not.toContain('rageMeter/fillLong');
      }
      const { frames, hidden } = heroFaces({ ...warrior, mana: 90, maxMana: 120 }, nested, parts);
      expect(frames['rageMeter/fillLong/run']).toBe(30);
      expect(hidden).not.toContain('rageMeter/fillLong/p1');
    });

    it('lights the fourth pip of a single four-pip length only at 120 power', () => {
      // One length, four pips beside its clip, as 1.1.4 lays it out.
      const one = { ...spec, groups: { ...spec.groups, fill: 'run', fillBeyond: 'run' } };
      const single = [
        'rageMeter',
        'rageMeter/run',
        'rageMeter/p1',
        'rageMeter/p2',
        'rageMeter/p3',
        'rageMeter/p4',
      ].map(path => ({
        name: path.split('/').pop()!,
        path,
        box: { x: 0, y: 0, w: 1, h: 1 },
        draws: true,
      }));
      const lit = (mana: number, maxMana: number) => {
        const { hidden } = heroFaces({ ...warrior, mana, maxMana }, one, single);
        return ['p1', 'p2', 'p3', 'p4'].filter(pip => !hidden.includes(`rageMeter/${pip}`));
      };
      expect(lit(30, 100)).toEqual(['p1']);
      expect(lit(100, 100)).toEqual(['p1', 'p2', 'p3']);
      expect(lit(120, 120)).toEqual(['p1', 'p2', 'p3', 'p4']);
    });

    it('reads as empty, every pip dark, with no top to fill towards', () => {
      const { frames, hidden } = heroFaces({ ...warrior, mana: 0, maxMana: 0 }, nested, parts);
      expect(frames['rageMeter/fill/run']).toBe(0);
      expect(hidden).toEqual(expect.arrayContaining(['rageMeter/fill/p1', 'rageMeter/fill/p3']));
    });

    it('climbs the meter itself where the build lays it out as one length', () => {
      const single = parts.filter(part => !part.path.includes('fill'));
      single.push({ ...single[0]!, name: 'run', path: 'rageMeter/run' });
      const { frames } = heroFaces({ ...warrior, mana: 50, maxMana: 100 }, nested, single);
      expect(frames['rageMeter/run']).toBe(25);
    });

    it('keeps a meter drawn whose two lengths are the one clip', () => {
      const same = { ...spec, groups: { ...spec.groups, fill: 'run', fillBeyond: 'run' } };
      const { frames, hidden } = heroFaces({ ...warrior, mana: 60, maxMana: 100 }, same);
      expect(hidden).not.toContain('rageMeter/run');
      expect(frames['rageMeter/run']).toBe(30);
    });
  });

  it('shows the in-combat mark only in combat', () => {
    expect(heroFaces({ ...hero, inCombat: true }, spec).hidden).not.toContain('fighting');
  });
});

describe('strangers', () => {
  const part = (path: string): PiecePart => ({
    name: path.split('/').pop()!,
    path,
    box: { x: 0, y: 0, w: 1, h: 1 },
    draws: true,
  });
  const whole = [
    part('back'),
    part('face'),
    part('face/hp'),
    part('face/portrait'),
    part('fighting'),
    part('rageMeter'),
    part('rageMeter/fill'),
    part('hint'),
    part('hint/faceHint'),
    part('minimap'),
    part('portrait'),
  ];
  const framed = { ...spec, frame: ['back', 'face'], values: { level: 'face/lv' } };

  it('leaves out every part of the shared dialog the frame does not name', () => {
    expect(strangers(whole, framed)).toEqual(['hint', 'minimap']);
  });

  it('keeps a stranger that shares its name with one of the frame own parts', () => {
    // Hiding goes by name, so leaving this one out would take the portrait
    // spot inside the frame with it.
    expect(strangers(whole, framed)).not.toContain('portrait');
  });

  it('takes a single frame part as well as several', () => {
    expect(strangers(whole, { ...framed, frame: 'face' })).toContain('back');
  });
});

describe('framedOn', () => {
  const framed = ['face', 'rageMeter', 'powerMeter'];

  it('stands the frame on what a caster draws, so the ring sits in the corner', () => {
    // A meter the hero does not spend is hidden, and a frame measured with
    // it would leave its empty room above and beside the ring.
    const { hidden } = heroFaces(hero, spec);
    expect(framedOn(framed, hidden)).toEqual(['face']);
  });

  it('keeps the meter a warrior spends in the frame', () => {
    const { hidden } = heroFaces({ ...hero, resource: 'morale', maxMana: 100 }, spec);
    expect(framedOn(framed, hidden)).toEqual(['face', 'rageMeter']);
  });

  it('takes a single frame part as it is', () => {
    expect(framedOn('face', ['face'])).toBe('face');
  });
});
