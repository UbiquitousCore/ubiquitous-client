/**
 * A controller as the game uses it: sticks steer, the shoulder triggers pick
 * which of three sets of four a face button belongs to, so ten bar sockets
 * and the everyday actions all sit under two thumbs and two fingers.
 */

/** The browser's "standard" layout, which Steam Input presents whatever is plugged in. */
const BUTTON = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  leftBumper: 4,
  rightBumper: 5,
  leftTrigger: 6,
  rightTrigger: 7,
  up: 12,
  down: 13,
} as const;

/** Pixels of look per second with the stick pushed all the way. Own choice. */
const LOOK_PIXELS_PER_SECOND = 700;

/** Wheel units per second while the zoom pad is held; a wheel notch is about 100. Own choice. */
const ZOOM_UNITS_PER_SECOND = 300;

/** Fraction of travel ignored around centre, so a worn stick does not drift the camera. Own choice. */
export const STICK_DEADZONE = 0.18;

/** A trigger counts as held past this much travel, for pads that report it as an axis-like value. */
const TRIGGER_PRESSED = 0.5;

/** What `navigator.getGamepads()` gives, narrowed to what is read here. */
export interface PadReading {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export interface PadFrame {
  /** Left stick, deadzoned, -1..1; up is negative y as the pad reports it. */
  moveX: number;
  moveY: number;
  /** Camera turn this frame in pixels, as a mouse drag would give. */
  lookX: number;
  lookY: number;
  /** Zoom this frame in wheel units; positive pulls the camera back. */
  zoom: number;
  castSlots: number[];
  jump: boolean;
  deselect: boolean;
  interact: boolean;
  /** -1 for the previous target, 1 for the next, 0 for neither. */
  targetStep: -1 | 0 | 1;
}

export const NO_PAD_FRAME: PadFrame = {
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  zoom: 0,
  castSlots: [],
  jump: false,
  deselect: false,
  interact: false,
  targetStep: 0,
};

/**
 * A stick with its centre ignored. The deadzone is radial, so a stick pushed
 * diagonally is not stiffer than one pushed along an axis, and the rest of
 * the travel is stretched to span 0..1 so there is no jump at the edge.
 */
export function stickVector(x: number, y: number, deadzone = STICK_DEADZONE): [number, number] {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) return [0, 0];
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return [(x / magnitude) * scaled, (y / magnitude) * scaled];
}

/**
 * The bar socket a face button stands for under the held triggers, or null.
 * Left trigger gives sockets 1-4, right gives 5-8, both give 9 and 10.
 */
export function socketUnderTriggers(
  leftHeld: boolean,
  rightHeld: boolean,
  face: 0 | 1 | 2 | 3,
): number | null {
  if (!leftHeld && !rightHeld) return null;
  const slot = (rightHeld ? 4 : 0) + (leftHeld && rightHeld ? 4 : 0) + face;
  return slot < 10 ? slot : null;
}

function held(buttons: PadReading['buttons'], index: number): boolean {
  const button = buttons[index];
  return button !== undefined && (button.pressed || button.value > TRIGGER_PRESSED);
}

/**
 * One frame of a controller. `before` is which buttons were down last frame:
 * presses act on the frame they go down, not while they are held, as a key
 * does. Triggers held together with a face button choose a bar socket
 * instead of the face button's plain meaning.
 */
export function readPad(reading: PadReading, before: readonly boolean[], dt: number): PadFrame {
  const down = (index: number): boolean => held(reading.buttons, index);
  const pressed = (index: number): boolean => down(index) && before[index] !== true;

  const [moveX, moveY] = stickVector(reading.axes[0] ?? 0, reading.axes[1] ?? 0);
  const [lookStickX, lookStickY] = stickVector(reading.axes[2] ?? 0, reading.axes[3] ?? 0);
  const lookScale = LOOK_PIXELS_PER_SECOND * dt;

  const leftHeld = down(BUTTON.leftTrigger);
  const rightHeld = down(BUTTON.rightTrigger);
  const modified = leftHeld || rightHeld;

  const castSlots: number[] = [];
  const faces = [BUTTON.a, BUTTON.b, BUTTON.x, BUTTON.y] as const;
  faces.forEach((index, face) => {
    if (!pressed(index)) return;
    const slot = socketUnderTriggers(leftHeld, rightHeld, face as 0 | 1 | 2 | 3);
    if (slot !== null) castSlots.push(slot);
  });

  let targetStep: -1 | 0 | 1 = 0;
  if (pressed(BUTTON.rightBumper)) targetStep = 1;
  else if (pressed(BUTTON.leftBumper)) targetStep = -1;

  const zoomIn = down(BUTTON.up) ? -1 : 0;
  const zoomOut = down(BUTTON.down) ? 1 : 0;

  return {
    moveX,
    moveY,
    // A squared response gives fine aim near centre and full speed at the rim.
    lookX: lookStickX * Math.abs(lookStickX) * lookScale,
    lookY: lookStickY * Math.abs(lookStickY) * lookScale,
    zoom: (zoomIn + zoomOut) * ZOOM_UNITS_PER_SECOND * dt,
    castSlots,
    jump: !modified && pressed(BUTTON.a),
    deselect: !modified && pressed(BUTTON.b),
    interact: !modified && pressed(BUTTON.x),
    targetStep,
  };
}

/** Which buttons are down, for the next frame's edge test. */
export function buttonsDown(reading: PadReading): boolean[] {
  return reading.buttons.map((_, index) => held(reading.buttons, index));
}

/** The first connected pad that uses the standard layout; others report buttons in unknowable order. */
export function firstStandardPad(pads: ArrayLike<Gamepad | null> | null | undefined): Gamepad | null {
  if (!pads) return null;
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    if (pad && pad.connected && pad.mapping === 'standard') return pad;
  }
  return null;
}
