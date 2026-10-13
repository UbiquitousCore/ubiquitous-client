/**
 * The spell, spell-visual, animation and mount columns, against synthetic
 * tables. Every value sits in the column the reader takes it from and
 * nowhere else, so a column that moves reads zero and fails here.
 */

import { describe, expect, it } from 'vitest';

import { WorldTables } from '../src/assets/formats/tables';
import { buildTable, buildTableFiles } from './helpers/fixtures';

function loader(extra: Array<{ name: string; data: Uint8Array }>) {
  const files = new Map(buildTableFiles().map(e => [e.name, e.data]));
  for (const e of extra) files.set(e.name, e.data);
  return async (entry: string) => files.get(entry) ?? null;
}

/** A row of `width` zeros with the given columns set. */
function row(width: number, set: Record<number, number | string>): (number | string)[] {
  const out: (number | string)[] = new Array(width).fill(0);
  for (const [at, v] of Object.entries(set)) out[Number(at)] = v;
  return out;
}

/** Format string: `u` everywhere, `s` at the given columns. */
function format(width: number, strings: number[] = []): string {
  return Array.from({ length: width }, (_, i) => (strings.includes(i) ? 's' : 'u')).join('');
}

const visual = buildTable(
  format(11),
  // Columns 1-7 are the phase rows (2 the wind-up); 8 missile, 9 streak,
  // 10 impact delay.
  [row(11, { 2: 20, 8: 31, 9: 0x02000004, 10: 250 })],
  [5],
);
const state = buildTable(
  format(11),
  // 1 caster animation, 2..7 effect per anchor (3 the chest), 8 sound,
  // 9 shake, 10 clip blend.
  [row(11, { 1: 70, 3: 30, 8: 4, 9: 6, 10: 2 })],
  [20],
);
const effect = buildTable(
  format(10, [1, 2]),
  // 1 name, 2 path, 6 scale percent, 7 placement, 8 flight, 9 count.
  [
    row(10, { 1: 'glow', 2: 'effects/glow.beff', 6: 150, 7: 2 }),
    row(10, { 1: 'bolt', 2: 'effects/bolt.beff', 6: 0, 8: 2, 9: 3 }),
  ],
  [30, 31],
);
const animation = buildTable(
  format(4, [1]),
  // 1 clip name, 2 loops.
  [row(4, { 1: 'cast_loop', 2: 1 })],
  [70],
);
const spells = buildTable(
  format(44, [10]),
  // The columns the reader takes: skill set, name, rank, description, icon,
  // cast time, cooldown, reach, mount kind, visual, power cost and flags
  // (0x4 marks a spell that is never cast).
  [
    row(44, {
      1: 3,
      5: 900,
      6: 2,
      7: 901,
      10: 'spell_fire.png',
      16: 1500,
      17: 8000,
      21: 30,
      26: 5,
      41: 40,
    }),
    row(44, { 1: 3, 10: '0', 43: 0x4 }),
    row(44, { 1: 3, 25: 1 }),
  ],
  [100, 101, 102],
);
const mounts = buildTable(
  'uussuuuus',
  // 0 id, 2 model, 3 texture, 8 effect.
  [[12, 0, '../../mid_data/model/mount/horse.bdae', 'horse_grey.tga', 0, 0, 0, 0, 'sfx_hoof_']],
  [12],
);

const EXTRA = [
  { name: 'tables/c_spellvisual.tbl', data: visual },
  { name: 'tables/c_spellvisualstate.tbl', data: state },
  { name: 'tables/c_spellvisualeffect.tbl', data: effect },
  { name: 'tables/c_animationdata.tbl', data: animation },
  { name: 'tables/spell_new.tbl', data: spells },
  { name: 'tables/mountprototype.tbl', data: mounts },
];

describe('spell visual tables', () => {
  it('resolves a visual through its phase, effect and animation rows', async () => {
    const tables = await WorldTables.load(loader(EXTRA));
    const v = tables.spellVisual(5)!;
    // The streak's look is the column's low byte.
    expect(v.weaponStreak).toBe(4);
    expect(v.impactDelayMs).toBe(250);
    expect(Object.values(v.phases).filter(p => p !== null)).toHaveLength(1);

    const windUp = v.phases.windUp!;
    expect(windUp).toMatchObject({
      casterClipId: 70,
      casterClip: 'cast_loop',
      casterClipLoops: true,
      wholeBody: true,
      sound: 4,
      shake: 6,
    });
    expect(windUp.effects).toEqual([
      {
        effectId: 30,
        name: 'glow',
        pathname: 'effects/glow.beff',
        placement: 'burst',
        scale: 1.5,
        flight: 'straight',
        count: 1,
        anchor: 'chest',
      },
    ]);
    // A missing scale reads as 100%; the missile has no anchor.
    expect(v.missile).toMatchObject({ scale: 1, flight: 'drain2', count: 3, anchor: null });
  });
});

describe('spell_new', () => {
  it('reads name, rank, description, icon, cast time and visual from their columns', async () => {
    const tables = await WorldTables.load(loader(EXTRA));
    expect(tables.spellNameId(100)).toBe(900);
    expect(tables.spellRank(100)).toBe(2);
    expect(tables.spellDescriptionId(100)).toBe(901);
    expect(tables.spellIcon(100)).toBe('spell_fire.png');
    expect(tables.spellCastingTime(100)).toBe(1500);
    expect(tables.spellVisualId(100)).toBe(5);
    expect(tables.spellIcon(101)).toBeNull();
  });

  it('reads what the spell book card shows: cost, cast time, cooldown and reach', async () => {
    const tables = await WorldTables.load(loader(EXTRA));
    expect(tables.spellStats(100)).toEqual({
      powerCost: 40,
      castMs: 1500,
      cooldownMs: 8000,
      range: 30,
      mount: false,
    });
    const none = { powerCost: 0, castMs: 0, cooldownMs: 0, range: 0, mount: false };
    expect(tables.spellStats(101)).toEqual(none);
    expect(tables.spellStats(999)).toEqual(none);
    expect(tables.spellStats(102).mount).toBe(true);
  });

  it('leaves out never-cast spells and mounts', async () => {
    const tables = await WorldTables.load(loader(EXTRA));
    expect(tables.spellCastable(100)).toBe(true);
    expect(tables.spellCastable(101)).toBe(false);
    expect(tables.spellCastable(102)).toBe(false);
  });
});

describe('mountprototype', () => {
  it('reads id, model, texture and effect, trimming the export-tree prefix', async () => {
    const tables = await WorldTables.load(loader(EXTRA));
    expect(tables.mounts()).toEqual([
      { id: 12, model: 'model/mount/horse.bdae', texture: 'horse_grey.tga', effect: 'sfx_hoof_' },
    ]);
  });
});

describe('visualWithEffect', () => {
  it('finds the visual that shows an effect file, whatever the case of the path', async () => {
    const tables = await WorldTables.load(loader(EXTRA));
    expect(tables.visualWithEffect('effects/glow.beff')).toBe(5);
    expect(tables.visualWithEffect('Effects/Glow.BEFF')).toBe(5);
  });

  it('finds a visual by its projectile too', async () => {
    const tables = await WorldTables.load(loader(EXTRA));
    expect(tables.visualWithEffect('effects/bolt.beff')).toBe(5);
  });

  it('answers null for a file no visual shows', async () => {
    const tables = await WorldTables.load(loader(EXTRA));
    expect(tables.visualWithEffect('effects/nothing.beff')).toBeNull();
  });
});
