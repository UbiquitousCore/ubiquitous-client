/**
 * The spell bar's state, seeded for the HUD bench.
 *
 * `worn.html?screen=hud` shows the bar with spells in nine of its twelve
 * slots and a mount in its own: two cooling at different points, two that
 * cost more than the hero has, and one being cast. `?bar=closed` starts it
 * slid away, `?cooling=<spell id>:<share left>,…` sets the cooldowns,
 * `?dead` makes the hero dead, and `?cast=<spell id>` picks the spell being
 * cast.
 *
 * Dev only. The icons are discs drawn here; nothing from a build is in them.
 */

import {
  WHEEL_FIRST,
  assignBarSlot,
  casting,
  cooldowns,
  initSpells,
  setMountSpells,
  setSpellIcon,
  setSpellName,
  setSpellStats,
} from '../src/gameplay/SpellBook';
import { setSpellBarOpen } from '../src/ui/spellBarModel';

const SPELLS = [301, 302, 303, 304, 305, 306, 307, 308, 309];
const MOUNT = 399;
const NAMES = [
  'Cleave',
  'Shield Wall',
  'Charge',
  'Rend',
  'Battle Shout',
  'Smite',
  'Heal',
  'Bolt',
  'Ward',
];

/** A disc of one colour with a letter on it, as a spell's icon. */
async function disc(hue: number, letter: string): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const pen = canvas.getContext('2d')!;
  pen.fillStyle = `hsl(${hue} 55% 40%)`;
  pen.fillRect(0, 0, 64, 64);
  pen.fillStyle = `hsl(${hue} 70% 70%)`;
  pen.beginPath();
  pen.arc(32, 32, 20, 0, Math.PI * 2);
  pen.fill();
  pen.fillStyle = 'white';
  pen.font = 'bold 28px sans-serif';
  pen.textAlign = 'center';
  pen.textBaseline = 'middle';
  pen.fillText(letter, 32, 34);
  return createImageBitmap(canvas);
}

export async function seedSpellBar(params: URLSearchParams): Promise<void> {
  initSpells(SPELLS, []);
  for (const [at, id] of SPELLS.entries()) {
    setSpellName(id, NAMES[at]!);
    setSpellIcon(id, await disc(at * 40, NAMES[at]![0]!));
    // The sixth and seventh cost more than the hero's 1,800.
    setSpellStats(id, {
      powerCost: at === 5 || at === 6 ? 5000 : 200,
      castMs: 1500,
      cooldownMs: 0,
      range: 30,
    });
  }
  setSpellName(MOUNT, 'Mount');
  setSpellIcon(MOUNT, await disc(200, 'M'));
  setSpellStats(MOUNT, { powerCost: 0, castMs: 0, cooldownMs: 0, range: 0 });
  setMountSpells([MOUNT]);
  const cooling = (params.get('cooling') ?? '302:0.8,304:0.3')
    .split(',')
    .filter(Boolean)
    .map(one => one.split(':').map(Number) as [number, number]);
  cooldowns.value = new Map(
    cooling.map(([id, left]) => [id, { spellId: id, remaining: left * 30_000, total: 30_000 }]),
  );
  const cast = Number(params.get('cast') ?? 303);
  if (cast) casting.value = { spellId: cast, targetId: null, castTime: 2000, elapsed: 800 };
  // The ring starts empty; three of its slots hold spells so the ring can be seen turned.
  [0, 1, 2, 3].forEach(at => assignBarSlot(WHEEL_FIRST + at, SPELLS[at + 4]!));
  assignBarSlot(WHEEL_FIRST + 11, SPELLS[0]!);
  setSpellBarOpen(params.get('bar') !== 'closed');
}
