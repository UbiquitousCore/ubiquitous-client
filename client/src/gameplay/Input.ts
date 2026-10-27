/** Raw input state (what the user is doing, not what it means — gameplay
 * decides that). Keyboard/mouse/touch all drive one InputState. */
export interface InputState {
  /** Bar sockets whose key was pressed since the last sample, 0-based. */
  castSlots: number[];
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  /**
   * True on the frame the jump key went down, not while it is held.
   *
   * Jump is an edge, not a state: holding space must not re-launch you the
   * instant you land. Reported once and cleared by `sample()`.
   */
  jump: boolean;
  /** True on the frame Escape went down: let go of whatever is targeted. */
  deselect: boolean;
  /**
   * True while the jump key is held.
   *
   * Jumping wants the edge — holding space must not re-launch you on landing —
   * but flying wants the hold, so you rise for as long as you press. Both are
   * reported and the caller picks.
   */
  ascend: boolean;
  /** Held. Descend, in fly mode. */
  descend: boolean;
  /** Accumulated mouse drag since the last read, in pixels. */
  dragX: number;
  dragY: number;
  /** Accumulated wheel delta since the last read. */
  wheel: number;
}

import { pinchWheel } from './pinch';
import { findTouch, TouchJoystick } from './TouchJoystick';
import { isTextEntry } from '../core/textEntry';
import { CAST_ACTIONS, DEFAULT_KEYBINDS, MOVEMENT_ACTIONS, castSlotOf } from './keybinds';
import type { Keybinds } from './keybinds';

/**
 * Fraction of the joystick's radius that must be crossed before it counts as
 * a direction. Below this, a thumb resting near centre would otherwise read
 * as a held key and the player would drift.
 */
const JOYSTICK_DEADZONE = 0.3;

/** `MouseEvent.buttons` bits for the left and right buttons. */
const LEFT_BUTTON = 1;
const RIGHT_BUTTON = 2;

/** Whether both the left and right buttons are held. */
export function bothButtons(buttons: number): boolean {
  return (buttons & (LEFT_BUTTON | RIGHT_BUTTON)) === (LEFT_BUTTON | RIGHT_BUTTON);
}

/** Held actions, by key. Rebuilt from the bindings by `setBindings`. */
type HeldAction = 'forward' | 'back' | 'left' | 'right' | 'ascend' | 'descend';

export class Input {
  private readonly held = new Set<string>();
  private dragX = 0;
  private dragY = 0;
  private wheel = 0;
  private jumpPressed = false;
  private deselectPressed = false;
  private dragging = false;
  /** The bindings in force, as per-key maps. Jump and the casts fire once on press. */
  private heldByKey: Record<string, HeldAction> = {};
  private jumpKeys = new Set<string>();
  private castByKey: Record<string, number> = {};
  /** Bar sockets pressed since the last sample. */
  private castPressed: number[] = [];
  /** Mouse buttons down right now, as `MouseEvent.buttons` reports them. */
  private mouseButtons = 0;
  private readonly teardown: Array<() => void> = [];

  /**
   * The finger driving look, tracked by id so a second finger on the
   * joystick is never mistaken for it. `movementX/Y` does not exist on
   * `Touch`, so the drag is accumulated by hand from successive positions.
   */
  private lookTouchId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  /**
   * A second finger on the game while one is looking: the two together are a
   * pinch, which zooms and, for as long as it lasts, does not turn the camera.
   */
  private pinchTouchId: number | null = null;
  private pinchLastX = 0;
  private pinchLastY = 0;

  /**
   * Built when the browser reports touch support, so a desktop session never
   * gets an on-screen joystick nobody can touch, and thereafter whatever the
   * settings screen says through `setJoystickEnabled`.
   */
  private joystick: TouchJoystick | null;

  constructor(private readonly target: HTMLElement) {
    this.setBindings(DEFAULT_KEYBINDS);
    this.joystick = hasTouch() ? new TouchJoystick(document.body) : null;
    this.bind();
  }

  /** Whether the on-screen stick is present. */
  get joystickEnabled(): boolean {
    return this.joystick !== null;
  }

  /** Show or remove the on-screen stick. A stick that is removed stops steering at once. */
  setJoystickEnabled(enabled: boolean): void {
    if (enabled === this.joystickEnabled) return;
    if (enabled) {
      this.joystick = new TouchJoystick(document.body);
    } else {
      this.joystick?.dispose();
      this.joystick = null;
    }
  }

  /**
   * Take a new set of bindings. Keys held under the old ones are released, so
   * a key that just moved does not keep walking you.
   */
  setBindings(binds: Keybinds): void {
    this.heldByKey = {};
    this.jumpKeys = new Set();
    this.castByKey = {};
    for (const action of MOVEMENT_ACTIONS) {
      for (const key of binds[action]) {
        if (action === 'jump') this.jumpKeys.add(key);
        else this.heldByKey[key] = action;
      }
    }
    for (const action of CAST_ACTIONS) {
      for (const key of binds[action]) this.castByKey[key] = castSlotOf(action);
    }
    this.held.clear();
  }

  /** Jump once, as the jump key does: the on-screen button's press. */
  requestJump(): void {
    this.jumpPressed = true;
  }

  /** Read and clear the accumulated deltas. Call once per frame. */
  sample(): InputState {
    // Additive to the keyboard, not a replacement for it: a direction is
    // true if either says so, so a touch-capable laptop with a keyboard
    // attached still works exactly as it did before touch existed.
    const stick = this.joystick?.read() ?? { x: 0, y: 0 };
    const state: InputState = {
      castSlots: this.castPressed,
      // Both mouse buttons together walk you the way you are looking, so the
      // mouse alone can carry you.
      forward:
        this.isDown('forward') || stick.y < -JOYSTICK_DEADZONE || bothButtons(this.mouseButtons),
      back: this.isDown('back') || stick.y > JOYSTICK_DEADZONE,
      left: this.isDown('left') || stick.x < -JOYSTICK_DEADZONE,
      right: this.isDown('right') || stick.x > JOYSTICK_DEADZONE,
      jump: this.jumpPressed,
      deselect: this.deselectPressed,
      ascend: this.isDown('ascend'),
      descend: this.isDown('descend'),
      dragX: this.dragX,
      dragY: this.dragY,
      wheel: this.wheel,
    };
    this.dragX = 0;
    this.dragY = 0;
    this.wheel = 0;
    this.jumpPressed = false;
    this.deselectPressed = false;
    this.castPressed = [];
    return state;
  }

  private isDown(action: HeldAction): boolean {
    for (const key of this.held) {
      if (this.heldByKey[key] === action) return true;
    }
    return false;
  }

  private bind(): void {
    const on = <K extends keyof WindowEventMap>(
      el: Window | HTMLElement,
      type: K,
      fn: (e: WindowEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      el.addEventListener(type, fn as EventListener, opts);
      this.teardown.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };

    on(window, 'keydown', e => {
      // Typing in a text field is not movement.
      if (isTextEntry(e.target)) return;
      // Some key sources (IME, autofill, virtual keyboards) fire with no
      // key at all; there is no binding to match, so there is nothing to do.
      const key = e.key?.toLowerCase();
      if (!key) return;
      if (key === 'escape' && !e.repeat) this.deselectPressed = true;
      if (this.heldByKey[key]) this.held.add(key);
      if (this.jumpKeys.has(key) && !e.repeat) {
        // Ignore the browser's auto-repeat: one press is one jump.
        this.jumpPressed = true;
      }
      const slot = this.castByKey[key];
      if (slot !== undefined && !e.repeat) this.castPressed.push(slot);
      // Space scrolls the page if we let it through.
      if (this.heldByKey[key] || this.jumpKeys.has(key) || slot !== undefined) e.preventDefault();
    });
    on(window, 'keyup', e => {
      const key = e.key?.toLowerCase();
      if (key) this.held.delete(key);
    });
    on(window, 'blur', () => {
      this.held.clear();
      this.jumpPressed = false;
    });

    on(this.target, 'mousedown', e => {
      this.dragging = true;
      this.mouseButtons = (e as MouseEvent).buttons;
      (e as MouseEvent).preventDefault();
    });
    on(window, 'mouseup', e => {
      this.dragging = false;
      this.mouseButtons = (e as MouseEvent).buttons;
    });
    // A press that ends off the page never sends its `mouseup` here.
    on(window, 'blur', () => {
      this.mouseButtons = 0;
    });
    on(window, 'mousemove', e => {
      if (!this.dragging) return;
      const me = e as MouseEvent;
      this.dragX += me.movementX;
      this.dragY += me.movementY;
    });
    on(
      this.target,
      'wheel',
      e => {
        this.wheel += (e as WheelEvent).deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
    on(this.target, 'contextmenu', e => e.preventDefault());

    // Every touch that lands on the game is offered to the stick first: a
    // thumb in the stick's zone moves, anything else looks. A second finger
    // that is not on the stick pinches with the look finger. Touches on the
    // HUD's own controls land on those and never reach here.
    on(
      this.target,
      'touchstart',
      e => {
        const touches = (e as TouchEvent).changedTouches;
        for (let i = 0; i < touches.length; i++) {
          const t = touches[i];
          if (this.joystick?.claim(t)) continue;
          if (this.lookTouchId === null) {
            this.lookTouchId = t.identifier;
            this.lookLastX = t.clientX;
            this.lookLastY = t.clientY;
          } else if (this.pinchTouchId === null) {
            this.pinchTouchId = t.identifier;
            this.pinchLastX = t.clientX;
            this.pinchLastY = t.clientY;
          }
        }
        e.preventDefault();
      },
      { passive: false },
    );
    on(
      window,
      'touchmove',
      e => {
        if (this.lookTouchId === null) return;
        const changed = (e as TouchEvent).changedTouches;
        const look = findTouch(changed, this.lookTouchId);
        const pinch = this.pinchTouchId === null ? null : findTouch(changed, this.pinchTouchId);
        if (!look && !pinch) return;

        if (this.pinchTouchId !== null) {
          const before = Math.hypot(
            this.lookLastX - this.pinchLastX,
            this.lookLastY - this.pinchLastY,
          );
          if (look) {
            this.lookLastX = look.clientX;
            this.lookLastY = look.clientY;
          }
          if (pinch) {
            this.pinchLastX = pinch.clientX;
            this.pinchLastY = pinch.clientY;
          }
          const after = Math.hypot(
            this.lookLastX - this.pinchLastX,
            this.lookLastY - this.pinchLastY,
          );
          this.wheel += pinchWheel(before, after);
        } else if (look) {
          this.dragX += look.clientX - this.lookLastX;
          this.dragY += look.clientY - this.lookLastY;
          this.lookLastX = look.clientX;
          this.lookLastY = look.clientY;
        }
        e.preventDefault();
      },
      { passive: false },
    );
    const releaseTouch = (e: Event): void => {
      const ended = (e as TouchEvent).changedTouches;
      if (this.pinchTouchId !== null && findTouch(ended, this.pinchTouchId)) {
        this.pinchTouchId = null;
      }
      if (this.lookTouchId !== null && findTouch(ended, this.lookTouchId)) {
        // The remaining finger carries on looking from where it is.
        this.lookTouchId = this.pinchTouchId;
        this.lookLastX = this.pinchLastX;
        this.lookLastY = this.pinchLastY;
        this.pinchTouchId = null;
      }
    };
    on(window, 'touchend', releaseTouch);
    on(window, 'touchcancel', releaseTouch);
  }

  dispose(): void {
    for (const off of this.teardown) off();
    this.teardown.length = 0;
    this.held.clear();
    this.joystick?.dispose();
  }
}

/** `maxTouchPoints` covers touch laptops too; the deprecated event check is the fallback. */
export function hasTouch(): boolean {
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}
