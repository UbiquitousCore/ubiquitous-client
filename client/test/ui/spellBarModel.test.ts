import { describe, expect, it } from 'vitest';

import type { PiecePart } from '../../src/ui/art/piecePlan';
import {
  barSwap,
  FLASH_FACE_MS,
  LEAST_FIT,
  closedShift,
  barPlacement,
  fitScale,
  flashFace,
  governingCooldown,
  handleFace,
  iconBox,
  justReady,
  slotRefs,
  slotUse,
  spellBarStates,
  sweepFace,
} from '../../src/ui/spellBarModel';
import type { SlotNames, SlotView } from '../../src/ui/spellBarModel';

const cd = (remaining: number, total = 1000) => ({ remaining, total });

describe('governingCooldown', () => {
  it('is nothing while neither is running', () => {
    expect(governingCooldown(undefined, null)).toBeNull();
    expect(governingCooldown(cd(0), cd(0))).toBeNull();
  });

  it('is the spell’s own cooldown when only it runs, and the global one when only that does', () => {
    expect(governingCooldown(cd(500), null)).toEqual(cd(500));
    expect(governingCooldown(undefined, cd(300, 1500))).toEqual(cd(300, 1500));
  });

  it('is the longer of the two, so a long cooldown is not shown ready after the global one', () => {
    expect(governingCooldown(cd(120_000, 120_000), cd(300, 1500))).toEqual(cd(120_000, 120_000));
    expect(governingCooldown(cd(200), cd(1400, 1500))).toEqual(cd(1400, 1500));
  });
});

describe('sweepFace', () => {
  const run = { first: 0, last: 71 };

  it('wears no face while nothing is cooling', () => {
    expect(sweepFace(null, run)).toBeNull();
  });

  it('wears the first face for a full cooldown and steps towards the last as it runs out', () => {
    expect(sweepFace(cd(1000), run)).toBe(0);
    expect(sweepFace(cd(500), run)).toBe(35);
    expect(sweepFace(cd(1), run)).toBe(70);
  });
});

describe('slotUse', () => {
  const ok = { cost: 100, power: 500, dead: false };

  it('is ready where the hero can pay', () => {
    expect(slotUse(ok)).toBe('ready');
    expect(slotUse({ ...ok, cost: 500 })).toBe('ready');
  });

  it('is short where the spell costs more than the hero has', () => {
    expect(slotUse({ ...ok, cost: 501 })).toBe('short');
  });

  it('is ready while the cost is unread, rather than guessing', () => {
    expect(slotUse({ ...ok, cost: undefined })).toBe('ready');
  });

  it('is blocked for a dead hero, whatever the cost', () => {
    expect(slotUse({ ...ok, dead: true })).toBe('blocked');
    expect(slotUse({ cost: 9999, power: 0, dead: true })).toBe('blocked');
  });
});

describe('flashFace', () => {
  const run = { first: 0, last: 17 };

  it('plays a face at a time, from the first', () => {
    expect(flashFace(0, run)).toBe(0);
    expect(flashFace(FLASH_FACE_MS * 3.5, run)).toBe(3);
  });

  it('is over at the last face, which takes the art away', () => {
    expect(flashFace(FLASH_FACE_MS * 16.5, run)).toBe(16);
    expect(flashFace(FLASH_FACE_MS * 17, run)).toBeNull();
    expect(flashFace(10_000, run)).toBeNull();
  });

  it('is not playing before it starts', () => {
    expect(flashFace(-1, run)).toBeNull();
  });
});

describe('justReady', () => {
  it('names the slots that were cooling and are not now', () => {
    expect(justReady([true, true, false, false], [false, true, false, true])).toEqual([0]);
  });

  it('names nothing for a slot that was already ready, or one that has only started', () => {
    expect(justReady([false, false], [false, true])).toEqual([]);
  });
});

describe('handleFace', () => {
  it('offers to close an open bar and to open a closed one', () => {
    expect(handleFace(true)).toBe(1);
    expect(handleFace(false)).toBe(0);
  });
});

describe('closedShift', () => {
  it('is how far the movie puts the bar past its screen, as a share of its width', () => {
    // As measured in the 1.1.4 movie: the bar's frame stands 144.9 units wide
    // from 423.6 on a 480-unit screen.
    expect(closedShift({ x: 423.6, w: 144.9 }, 480)).toBeCloseTo(0.61, 2);
  });

  it('is nothing for a bar that is inside its screen', () => {
    expect(closedShift({ x: 300, w: 100 }, 480)).toBe(0);
  });

  it('never slides further than the bar is wide', () => {
    expect(closedShift({ x: 900, w: 100 }, 480)).toBe(1);
  });
});

describe('fitScale', () => {
  it('leaves a bar that fits at its own size', () => {
    expect(fitScale(500, 400)).toBe(1);
  });

  it('shrinks a bar to the room it has', () => {
    expect(fitScale(300, 400)).toBe(0.75);
  });

  it('never shrinks it past the point its slots can be pressed, whatever room there is', () => {
    expect(fitScale(-50, 400)).toBe(LEAST_FIT);
    expect(fitScale(100, 400)).toBe(LEAST_FIT);
  });

  it('has nothing to fit where it has no height', () => {
    expect(fitScale(100, 0)).toBe(1);
  });
});

describe('iconBox', () => {
  const slot = { x: 56, y: 10, w: 36, h: 36 };

  it('places the icon where the slot’s tint covers, scaled to the slot as drawn', () => {
    const tint = { x: 59, y: 13, w: 32, h: 32 };
    const drawn = { x: 100, y: 200, w: 72, h: 72 };
    expect(iconBox(slot, tint, drawn)).toEqual({ x: 106, y: 206, w: 64, h: 64 });
  });

  it('fills the slot where it has no tint to go by', () => {
    const drawn = { x: 100, y: 200, w: 72, h: 72 };
    expect(iconBox(slot, undefined, drawn)).toEqual(drawn);
  });
});

const NAMES: SlotNames = {
  slot: 'btn',
  within: 'panelButton',
  mount: 'MountSkill/btnMountSkill',
  sweep: 'rectcooldown',
  unusable: 'redmask',
  short: 'bluemask',
  lit: 'hot',
  resting: 'beforeAttack',
  flash: 'cooldownFinish',
};

function part(path: string): PiecePart {
  return { name: path.split('/').pop()!, path, box: { x: 0, y: 0, w: 1, h: 1 }, draws: true };
}

const PARTS = [
  'panelButton',
  'panelButton/btn02',
  'panelButton/btn01',
  'panelButton/btn10',
  'panelButton/beforeAttack01',
  'MountSkill',
  'MountSkill/btnMountSkill',
].map(part);

describe('slotRefs', () => {
  it('lists the numbered slots in order and the mount’s after them', () => {
    expect(slotRefs(PARTS, NAMES).map(slot => [slot.index, slot.path])).toEqual([
      [0, 'panelButton/btn01'],
      [1, 'panelButton/btn02'],
      [2, 'panelButton/btn10'],
      [3, 'MountSkill/btnMountSkill'],
    ]);
  });

  it('finds what lies in and beside each slot by its number', () => {
    const [first, , , mount] = slotRefs(PARTS, NAMES);
    expect(first).toMatchObject({
      sweep: 'panelButton/btn01/rectcooldown',
      unusable: 'panelButton/btn01/redmask',
      short: 'panelButton/btn01/bluemask',
      lit: 'panelButton/btn01/hot',
      resting: 'panelButton/beforeAttack01',
      flash: 'panelButton/cooldownFinish01',
    });
    // The mount's art is numbered after the run, in its own holder.
    expect(mount).toMatchObject({
      resting: 'MountSkill/beforeAttack11',
      flash: 'MountSkill/cooldownFinish11',
    });
  });

  it('has no mount slot where the dialog has none', () => {
    const without = PARTS.filter(one => !one.path.startsWith('MountSkill'));
    expect(slotRefs(without, NAMES)).toHaveLength(3);
  });
});

describe('spellBarStates', () => {
  const refs = slotRefs(PARTS, NAMES);
  const idle: SlotView = {
    filled: true,
    pressed: false,
    sweep: null,
    use: 'ready',
    lit: false,
    flash: null,
  };
  const states = (views: SlotView[], open = true) =>
    spellBarStates(refs, views, { dialog: 'dlg', open });

  it('turns the bar to the face for its handle, and leaves every flash out of the base', () => {
    const { base } = states([idle, idle, idle, idle], false);
    expect(base.frames).toEqual({ dlg: 0 });
    expect(states([idle, idle, idle, idle]).base.frames).toEqual({ dlg: 1 });
    expect(base.hidden).toContain('panelButton/cooldownFinish01');
    expect(base.hidden).toContain('MountSkill/cooldownFinish11');
  });

  it('draws nothing over a slot that is only holding a spell', () => {
    expect(states([idle, idle, idle, idle]).over.only).toEqual([]);
  });

  it('draws the swirl over a slot only while it is pressed', () => {
    const held = { ...idle, pressed: true };
    expect(states([held, idle, idle, idle]).over.only).toEqual(['panelButton/beforeAttack01']);
  });

  it('draws and turns the sweep of a slot that is cooling', () => {
    const { over } = states([{ ...idle, sweep: 30 }, idle, idle, idle]);
    expect(over.only).toEqual(['panelButton/btn01/rectcooldown']);
    expect(over.driven).toEqual(['panelButton/btn01/rectcooldown']);
    expect(over.frames).toEqual({ 'panelButton/btn01/rectcooldown': 30 });
  });

  it('tints a slot red when it is blocked and blue when it is short, and only when it holds a spell', () => {
    const { over } = states([
      { ...idle, use: 'blocked' },
      { ...idle, use: 'short' },
      { ...idle, filled: false, use: 'short' },
      idle,
    ]);
    expect(over.driven).toEqual(['panelButton/btn01/redmask', 'panelButton/btn02/bluemask']);
  });

  it('lights the slot being cast and plays a flash on the face it is at', () => {
    const { over } = states([{ ...idle, lit: true }, { ...idle, flash: 4 }, idle, idle]);
    expect(over.driven).toEqual(['panelButton/btn01/hot']);
    expect(over.only).toEqual(['panelButton/btn01/hot', 'panelButton/cooldownFinish02']);
    expect(over.frames).toEqual({ 'panelButton/cooldownFinish02': 4 });
  });
});

describe('barPlacement', () => {
  it('stands above the jump button while it fits there', () => {
    expect(barPlacement(true, 500, 700, 400)).toEqual({ covers: false, fit: 1 });
  });

  it('takes the corner, and the room down to the foot, when it does not fit above', () => {
    expect(barPlacement(true, 300, 600, 400)).toEqual({ covers: true, fit: 1 });
    expect(barPlacement(true, 300, 300, 400).fit).toBe(0.75);
  });

  it('leaves the corner alone while closed', () => {
    expect(barPlacement(false, 300, 600, 400).covers).toBe(false);
  });
});

describe('barSwap', () => {
  const held = [101, 102, null, 900];

  it('trades two slots, or moves a spell into an empty one', () => {
    expect(barSwap(0, 1, held)).toEqual([
      [1, 101],
      [0, 102],
    ]);
    expect(barSwap(1, 2, held)).toEqual([
      [2, 102],
      [1, null],
    ]);
  });

  it('asks for nothing on a drop back on itself, off the bar, or from an empty slot', () => {
    expect(barSwap(0, 0, held)).toBeNull();
    expect(barSwap(0, null, held)).toBeNull();
    expect(barSwap(2, 0, held)).toBeNull();
  });

  it('leaves the mount’s own slot out of it', () => {
    expect(barSwap(3, 0, held)).toBeNull();
    expect(barSwap(0, 3, held)).toBeNull();
  });
});
