/**
 * Floating combat numbers, painted on a canvas over the world: one per change
 * to a body's health, over that body, or over the hero's portrait when it is
 * the hero's own. A canvas rather than DOM, because every number moves every
 * frame and the HUD should not re-render for a fading digit.
 */

import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { canvasFont } from '../../core/lettering';
import { floatFade, floatScale, floatingNumbers } from '../../gameplay/SpellBook';
import type { FloatingNumber } from '../../gameplay/SpellBook';

export type { FloatingNumber };

/** Number colours as `r, g, b`: white for a blow, yellow for a spell, green for a heal. */
const TONE_COLOUR = {
  hit: '255, 255, 255',
  spell: '229, 224, 0',
  heal: '8, 221, 37',
} as const;

/**
 * Font sizes in CSS pixels: over the world, and a size down over the hero or
 * for an off-hand blow.
 */
const FONT_PX = { world: 22, worldCritical: 30, hero: 18, heroCritical: 24 };

/** The number as written: heals `+`, blows on the hero `-`, others bare, absorbed `0`, turned blows as words. */
export function combatText(n: FloatingNumber): string {
  const size = Math.abs(n.value);
  if (n.word) return size === 0 ? n.word : `${n.word} ${n.onSelf ? `-${size}` : size}`;
  if (size === 0) return '0';
  if (n.tone === 'heal') return `+${size}`;
  return n.onSelf ? `-${size}` : String(size);
}

/**
 * The font one number is drawn in: its style's size times its current
 * scale, in the interface's body face. Numbers are painted afresh every
 * frame, so they are in that face from the first frame after it loads.
 */
export function fontFor(n: FloatingNumber): string {
  const base =
    n.onSelf || n.offHand
      ? n.critical
        ? FONT_PX.heroCritical
        : FONT_PX.hero
      : n.critical
        ? FONT_PX.worldCritical
        : FONT_PX.world;
  return canvasFont(Number((base * floatScale(n)).toFixed(1)));
}

/** How solid a number of this age is drawn. */
export function fadeAt(n: FloatingNumber): number {
  return floatFade(n);
}

/**
 * Paint one frame's worth of numbers. Exported so a test can drive it.
 *
 * `hero` is where the player's own frame is on screen, read from the
 * frame's own box so it follows whatever layout the HUD has.
 */
export function drawNumbers(
  context: CanvasRenderingContext2D,
  numbers: readonly FloatingNumber[],
  width: number,
  height: number,
  hero: { x: number; y: number } | null = null,
): void {
  context.clearRect(0, 0, width, height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const n of numbers) {
    const at = n.onSelf ? hero : n.onScreen ? { x: n.x, y: n.y } : null;
    if (!at) continue;
    const alpha = fadeAt(n);
    if (alpha <= 0) continue;
    context.font = fontFor(n);
    const text = combatText(n);
    // A drop shadow keeps a white glyph readable over bright ground.
    context.fillStyle = `rgba(0, 0, 0, ${alpha * 0.85})`;
    context.fillText(text, at.x + 2, at.y + 2);
    context.fillStyle = `rgba(${TONE_COLOUR[n.tone]}, ${alpha})`;
    context.fillText(text, at.x, at.y);
  }
}

/** The hero's portrait socket in CSS pixels (`data-socket`), where the hero's numbers are drawn. */
function heroAnchor(): { x: number; y: number } | null {
  const frame = document.querySelector('[data-hud="player"]');
  if (!frame) return null;
  const socket = frame.querySelector('[data-socket]') ?? frame;
  const box = socket.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

export function DamageNumbers(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let frame = 0;
    let cssWidth = 0;
    let cssHeight = 0;
    // One last paint after the final number goes — to clear it — and then
    // nothing until the next blow lands.
    let dirty = false;

    const paint = (): void => {
      frame = requestAnimationFrame(paint);
      // `peek`, not `value`: this loop must not subscribe to the signal, or
      // adding a number would re-render the component that owns the canvas
      // and throw away the loop.
      const numbers = floatingNumbers.peek();
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      if (width !== cssWidth || height !== cssHeight) {
        cssWidth = width;
        cssHeight = height;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        // Draw in CSS pixels; the backing store carries the device ratio.
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else if (numbers.length === 0 && !dirty) {
        return;
      }
      dirty = numbers.length > 0;
      drawNumbers(context, numbers, width, height, heroAnchor());
    };

    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas className="pointer-events-none fixed inset-0 z-hud-float size-full" ref={canvasRef} />
  );
}
