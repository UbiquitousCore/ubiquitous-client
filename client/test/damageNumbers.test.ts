/**
 * The number over a body, and the one over the player's own portrait.
 *
 * `damage` on the wire is a signed change to health: a blow is negative and
 * a heal positive. How it is written, how long it stays, how it moves, grows
 * and fades all depend on whether it landed on the hero and whether it was a
 * critical; each of those is pinned here as behaviour.
 */

import { describe, expect, it } from 'vitest';
import { BODY_STACK } from '../src/core/lettering';
import { combatText, drawNumbers, fadeAt, fontFor } from '../src/ui/components/DamageNumbers';
import {
  FLOAT_LIFE,
  FLOAT_RISE,
  FLOAT_SOLID_SHARE,
  floatLifetime,
  floatRise,
  floatScale,
} from '../src/gameplay/SpellBook';
import type { FloatingNumber } from '../src/gameplay/SpellBook';

function number(over: Partial<FloatingNumber> = {}): FloatingNumber {
  return {
    id: 1,
    value: -30,
    entityId: 7,
    worldY: 2,
    offsetX: 0,
    offsetY: 0,
    x: 0,
    y: 0,
    onScreen: true,
    age: 0,
    tone: 'hit',
    onSelf: false,
    critical: false,
    offHand: false,
    ...over,
  };
}

const px = (font: string): number => Number(/([\d.]+)px/.exec(font)![1]);

describe('how a combat number reads', () => {
  it('writes a blow a shield took whole as 0, over a body and over the hero alike', () => {
    expect(combatText(number({ value: 0 }))).toBe('0');
    expect(combatText(number({ value: 0, onSelf: true }))).toBe('0');
    expect(combatText(number({ value: 0, tone: 'spell', onSelf: true }))).toBe('0');
  });

  it('says a blow turned aside by its word, beside whatever still got through', () => {
    expect(combatText(number({ value: 0, word: 'Parry' }))).toBe('Parry');
    expect(combatText(number({ value: -12, word: 'Block' }))).toBe('Block 12');
    expect(combatText(number({ value: -12, word: 'Block', onSelf: true }))).toBe('Block -12');
  });

  it('draws in the interface’s body face, in its one weight', () => {
    // Painted afresh every frame, so it is in that face from the first
    // frame after the face loads.
    for (const over of [{}, { critical: true }, { onSelf: true }, { offHand: true }]) {
      const font = fontFor(number(over));
      expect(font.endsWith(` ${BODY_STACK}`)).toBe(true);
      expect(font).not.toMatch(/bold/);
    }
  });

  it('draws an off-hand blow a size down from the main hand’s', () => {
    expect(px(fontFor(number({ offHand: true })))).toBeLessThan(px(fontFor(number())));
    expect(px(fontFor(number({ offHand: true, critical: true })))).toBeLessThan(
      px(fontFor(number({ critical: true }))),
    );
  });

  it('writes a blow on somebody else as its size', () => {
    expect(combatText(number({ value: -30 }))).toBe('30');
  });

  it('writes a blow on the hero as a loss', () => {
    expect(combatText(number({ value: -30, onSelf: true }))).toBe('-30');
  });

  it('gives every heal a plus, critical or not, wherever it lands', () => {
    for (const critical of [false, true]) {
      for (const onSelf of [false, true]) {
        expect(combatText(number({ value: 42, tone: 'heal', critical, onSelf }))).toBe('+42');
      }
    }
  });
});

describe('how long each style lives', () => {
  it('keeps a critical up longer than an ordinary number', () => {
    expect(floatLifetime(number({ critical: true }))).toBeGreaterThan(floatLifetime(number()));
  });

  it('keeps the hero’s up longest, critical or not', () => {
    const hero = floatLifetime(number({ onSelf: true }));
    expect(hero).toBeGreaterThan(floatLifetime(number({ critical: true })));
    expect(floatLifetime(number({ onSelf: true, critical: true }))).toBe(hero);
  });
});

describe('how each style moves', () => {
  it('rises the full distance over its life, fastest at first', () => {
    expect(floatRise(number({ age: 0 }))).toBe(0);
    expect(floatRise(number({ age: FLOAT_LIFE }))).toBeCloseTo(FLOAT_RISE, 6);
    expect(floatRise(number({ age: FLOAT_LIFE / 2 }))).toBeGreaterThan(FLOAT_RISE / 2);
  });

  it('rises a critical less far', () => {
    const critical = number({ critical: true, age: floatLifetime(number({ critical: true })) });
    expect(floatRise(critical)).toBeGreaterThan(0);
    expect(floatRise(critical)).toBeLessThan(FLOAT_RISE);
  });

  it('keeps the hero’s still, pinned to the HUD', () => {
    expect(floatRise(number({ onSelf: true, age: 1 }))).toBe(0);
  });
});

describe('how each style grows', () => {
  it('pops an ordinary number up to its size and holds it there', () => {
    expect(floatScale(number({ age: 0 }))).toBeLessThan(1);
    expect(floatScale(number({ age: 0.5 }))).toBe(1);
    expect(floatScale(number({ age: FLOAT_LIFE }))).toBe(1);
  });

  it('lands a critical large and settles it onto its size', () => {
    expect(floatScale(number({ critical: true, age: 0 }))).toBeGreaterThan(1.2);
    expect(floatScale(number({ critical: true, age: 1 }))).toBe(1);
    expect(floatScale(number({ onSelf: true, critical: true, age: 0 }))).toBeGreaterThan(1.2);
  });

  it('never changes the size of the hero’s ordinary number', () => {
    for (const age of [0, 0.05, 1]) expect(floatScale(number({ onSelf: true, age }))).toBe(1);
  });

  it('never jumps in size from one frame to the next', () => {
    for (const style of [{}, { critical: true }]) {
      let last = floatScale(number({ ...style, age: 0 }));
      for (let age = 1 / 60; age < 1; age += 1 / 60) {
        const next = floatScale(number({ ...style, age }));
        expect(Math.abs(next - last)).toBeLessThan(0.1);
        last = next;
      }
    }
  });
});

describe('how each style fades', () => {
  it('holds solid for most of its life, then fades out smoothly', () => {
    expect(fadeAt(number({ age: 0 }))).toBe(1);
    expect(fadeAt(number({ age: FLOAT_LIFE * FLOAT_SOLID_SHARE }))).toBe(1);
    const late = fadeAt(number({ age: FLOAT_LIFE * 0.9 }));
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(1);
    expect(fadeAt(number({ age: FLOAT_LIFE }))).toBe(0);
  });

  it('holds the hero’s for longer, on the same pattern', () => {
    const hero = number({ onSelf: true });
    const life = floatLifetime(hero);
    expect(fadeAt({ ...hero, age: FLOAT_LIFE })).toBe(1);
    expect(fadeAt({ ...hero, age: life })).toBe(0);
  });
});

describe('how a combat number is sized', () => {
  it('draws a critical larger than an ordinary number, over the world and the hero', () => {
    const settled = { age: 1 };
    expect(px(fontFor(number({ ...settled, critical: true })))).toBeGreaterThan(
      px(fontFor(number(settled))),
    );
    expect(px(fontFor(number({ ...settled, onSelf: true, critical: true })))).toBeGreaterThan(
      px(fontFor(number({ ...settled, onSelf: true }))),
    );
  });

  it('draws the hero’s a size down', () => {
    const settled = { age: 1 };
    expect(px(fontFor(number({ ...settled, onSelf: true })))).toBeLessThan(
      px(fontFor(number(settled))),
    );
  });

  it('scales the font by the growth the number has reached', () => {
    expect(px(fontFor(number({ age: 0 })))).toBeLessThan(px(fontFor(number({ age: 1 }))));
  });
});

/**
 * A 2D context that records what it was asked to draw.
 *
 * The point of the canvas is that a number follows the body it belongs to, so
 * the thing worth pinning is that what lands on the canvas is the position the
 * game projected this frame — not one baked in when the blow landed.
 */
function recordingContext(): {
  context: CanvasRenderingContext2D;
  drawn: Array<{ text: string; x: number; y: number; style: string; font: string }>;
  readonly cleared: number;
} {
  const drawn: Array<{ text: string; x: number; y: number; style: string; font: string }> = [];
  const state = { cleared: 0 };
  const fake = {
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    clearRect: () => {
      state.cleared++;
    },
    fillText(text: string, x: number, y: number): void {
      drawn.push({ text, x, y, style: String(fake.fillStyle), font: String(fake.font) });
    },
  };
  return {
    context: fake as unknown as CanvasRenderingContext2D,
    drawn,
    get cleared() {
      return state.cleared;
    },
  };
}

describe('painting a frame', () => {
  it('draws each number where the body is now, over its own shadow', () => {
    const rec = recordingContext();
    drawNumbers(rec.context, [number({ x: 400, y: 250 })], 800, 600);
    // Two passes: the shadow first, offset, then the glyph itself.
    expect(rec.drawn).toHaveLength(2);
    expect(rec.drawn[1]).toMatchObject({ text: '30', x: 400, y: 250 });
    expect(rec.drawn[0]!.x).toBeGreaterThan(rec.drawn[1]!.x);
    expect(rec.drawn[0]!.style).toContain('rgba(0, 0, 0');
  });

  it('draws the hero’s at the frame it is given, not where the body is', () => {
    const rec = recordingContext();
    drawNumbers(
      rec.context,
      [number({ onSelf: true, x: 400, y: 250, onScreen: false })],
      800,
      600,
      { x: 90, y: 60 },
    );
    expect(rec.drawn[1]).toMatchObject({ text: '-30', x: 90, y: 60 });
  });

  it('draws nothing over the hero when the frame is not up', () => {
    const rec = recordingContext();
    drawNumbers(rec.context, [number({ onSelf: true })], 800, 600, null);
    expect(rec.drawn).toHaveLength(0);
  });

  it('clears the whole canvas first, so nothing smears', () => {
    const rec = recordingContext();
    drawNumbers(rec.context, [], 800, 600);
    expect(rec.cleared).toBe(1);
    expect(rec.drawn).toHaveLength(0);
  });

  it('skips a body the camera cannot see', () => {
    const rec = recordingContext();
    drawNumbers(rec.context, [number({ onScreen: false })], 800, 600);
    expect(rec.drawn).toHaveLength(0);
  });

  it('skips one that has already faded out', () => {
    const rec = recordingContext();
    drawNumbers(rec.context, [number({ age: FLOAT_LIFE })], 800, 600);
    expect(rec.drawn).toHaveLength(0);
  });

  it('colours a blow white, a spell yellow and a heal green', () => {
    const rec = recordingContext();
    drawNumbers(
      rec.context,
      [
        number({ x: 1, y: 1 }),
        number({ tone: 'spell', x: 1, y: 1 }),
        number({ tone: 'heal', value: 5, x: 2, y: 2 }),
      ],
      800,
      600,
    );
    const [hit, spell, heal] = [1, 3, 5].map(i => rgb(rec.drawn[i]!.style));
    expect(hit).toEqual([255, 255, 255]);
    // Yellow: red and green high, blue low.
    expect(Math.min(spell![0]!, spell![1]!)).toBeGreaterThan(200);
    expect(spell![2]).toBeLessThan(60);
    // Green: green well above red and blue.
    expect(heal![1]).toBeGreaterThan(heal![0]! * 3);
    expect(heal![1]).toBeGreaterThan(heal![2]! * 3);
  });
});

function rgb(style: string): number[] {
  return style
    .replace(/rgba\(|\)/g, '')
    .split(',')
    .slice(0, 3)
    .map(Number);
}
