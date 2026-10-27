/**
 * An on-screen joystick that floats: a thumb anywhere in the zone takes it,
 * and dragging past the rim pulls the ring along. Reports a [-1, 1] vector;
 * `Input` turns it into movement.
 */

/** A point on the screen, in CSS pixels. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The lower-left corner of the screen, where a left thumb rests: a touch
 * must land in the left `STICK_ZONE_WIDTH` of the width and the bottom
 * `STICK_ZONE_HEIGHT` of the height to take the stick. Anywhere else looks.
 * Own choice: 40% by 45% keeps the corner generous without covering the
 * middle of the view that looking and tapping need.
 */
export const STICK_ZONE_WIDTH = 0.4;
export const STICK_ZONE_HEIGHT = 0.45;

/**
 * How far a thumb must travel from where it landed before the stick wakes.
 * A tap, or a thumb resting on the glass, stays under it and moves nothing.
 * Own choice: about a fingertip's wobble on a phone.
 */
export const STICK_DRAG_SLOP = 10;

/** Whether a touch landing at (`x`, `y`) on a `width` × `height` screen takes the stick. */
export function inStickZone(x: number, y: number, width: number, height: number): boolean {
  return (
    x >= 0 && x < width * STICK_ZONE_WIDTH && y >= height * (1 - STICK_ZONE_HEIGHT) && y <= height
  );
}

/** Inside the rim the ring stays; past it the ring is dragged so the thumb sits on the rim at full tilt. */
export function followThumb(
  centre: Point,
  thumb: Point,
  radius: number,
): { centre: Point; x: number; y: number } {
  if (radius <= 0) return { centre, x: 0, y: 0 };
  const dx = thumb.x - centre.x;
  const dy = thumb.y - centre.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= radius) return { centre, x: dx / radius, y: dy / radius };
  const ux = dx / dist;
  const uy = dy / dist;
  return {
    centre: { x: thumb.x - ux * radius, y: thumb.y - uy * radius },
    x: ux,
    y: uy,
  };
}

/** Keep a ring of `radius` centred at `p` wholly inside a `width` × `height` screen. */
export function keepOnScreen(p: Point, radius: number, width: number, height: number): Point {
  const clamp = (v: number, hi: number) =>
    hi < radius ? hi / 2 : Math.min(Math.max(v, radius), hi - radius);
  return { x: clamp(p.x, width), y: clamp(p.y, height) };
}

/** Styled with app utilities, wearing ring and knob from the player's sheet; takes no touches (`Input` hands them over). */
const BASE =
  'pointer-events-none fixed bottom-safe-b left-safe-l z-hud-float m-6 size-30 rounded-full ' +
  'surface-stick-ring bg-white/10 opacity-0 data-held:opacity-100 short-landscape:size-23';

/**
 * No `-translate-x-1/2` here on purpose: the drag writes `transform`, and
 * Tailwind's translate utilities set the separate `translate` property — both
 * would apply, and the knob would travel twice as far as the finger. Centring
 * is part of the same `transform` the drag rewrites.
 */
const KNOB =
  'pointer-events-none absolute top-1/2 left-1/2 size-18 rounded-full surface-stick-knob ' +
  'bg-white/35 short-landscape:size-14';

/** The knob, centred on the ring. Also where a released drag returns it to. */
const KNOB_CENTRED = 'translate(-50%, -50%)';

export class TouchJoystick {
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private touchId: number | null = null;
  /** The ring's centre while a thumb holds it, in screen pixels. */
  private centre: Point = { x: 0, y: 0 };
  /** The ring's centre at rest, where `base` is drawn without a transform. */
  private rest: Point = { x: 0, y: 0 };
  /** Where a claimed thumb landed, until it has dragged far enough to wake the stick. */
  private pending: Point | null = null;
  private vecX = 0;
  private vecY = 0;
  private readonly teardown: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = BASE;
    this.knob = document.createElement('div');
    this.knob.className = KNOB;
    this.knob.style.transform = KNOB_CENTRED;
    this.base.append(this.knob);
    container.append(this.base);

    this.bind();
  }

  /** The stick's current position, both axes in [-1, 1]. Zero when untouched. */
  read(): { x: number; y: number } {
    return { x: this.vecX, y: this.vecY };
  }

  /**
   * Offer a touch that has just landed on the game. Takes it, and answers
   * true, when no thumb holds the stick already and the touch is in the
   * zone. The stick only moves once the thumb drags; a tap leaves it idle.
   */
  claim(touch: Touch): boolean {
    if (this.touchId !== null) return false;
    if (!inStickZone(touch.clientX, touch.clientY, window.innerWidth, window.innerHeight)) {
      return false;
    }
    this.touchId = touch.identifier;
    this.pending = { x: touch.clientX, y: touch.clientY };
    return true;
  }

  private wake(): void {
    const start = this.pending!;
    this.pending = null;
    const rect = this.base.getBoundingClientRect();
    this.rest = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    this.centre = keepOnScreen(start, this.radius(), window.innerWidth, window.innerHeight);
    this.base.dataset.held = '';
  }

  private radius(): number {
    return this.base.clientWidth / 2;
  }

  private bind(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      el: EventTarget,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      el.addEventListener(type, fn as EventListener, opts);
      this.teardown.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };

    // Bound to the window: a drag routinely carries the thumb far from where
    // it landed, and the stick must keep following it.
    on(
      window,
      'touchmove',
      e => {
        if (this.touchId === null) return;
        const t = findTouch((e as TouchEvent).changedTouches, this.touchId);
        if (!t) return;
        if (this.pending) {
          const moved = Math.hypot(t.clientX - this.pending.x, t.clientY - this.pending.y);
          if (moved < STICK_DRAG_SLOP) {
            e.preventDefault();
            return;
          }
          this.wake();
        }
        this.updateFrom(t.clientX, t.clientY);
        e.preventDefault();
      },
      { passive: false },
    );

    const release = (e: Event): void => {
      if (this.touchId === null) return;
      if (!findTouch((e as TouchEvent).changedTouches, this.touchId)) return;
      this.touchId = null;
      this.pending = null;
      this.vecX = 0;
      this.vecY = 0;
      delete this.base.dataset.held;
      this.base.style.transform = '';
      this.knob.style.transform = KNOB_CENTRED;
    };
    on(window, 'touchend', release);
    on(window, 'touchcancel', release);
  }

  private updateFrom(clientX: number, clientY: number): void {
    const radius = this.radius();
    const next = followThumb(this.centre, { x: clientX, y: clientY }, radius);
    this.centre = next.centre;
    this.vecX = next.x;
    this.vecY = next.y;
    this.base.style.transform = `translate(${this.centre.x - this.rest.x}px, ${this.centre.y - this.rest.y}px)`;
    this.knob.style.transform = `translate(calc(-50% + ${next.x * radius}px), calc(-50% + ${next.y * radius}px))`;
  }

  dispose(): void {
    for (const off of this.teardown) off();
    this.teardown.length = 0;
    this.base.remove();
  }
}

/** Shared with `Input`'s own touch-look tracking. */
export function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i];
  }
  return null;
}
