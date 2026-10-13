/** Key bindings by lower-cased `KeyboardEvent.key`; an action may have several keys, a key one action. */

export const MOVEMENT_ACTIONS = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'ascend',
  'descend',
] as const;

/** One per bar button; `cast1` is the top-left socket. */
export const CAST_ACTIONS = [
  'cast1',
  'cast2',
  'cast3',
  'cast4',
  'cast5',
  'cast6',
  'cast7',
  'cast8',
  'cast9',
  'cast10',
] as const;

export type MovementAction = (typeof MOVEMENT_ACTIONS)[number];
export type CastAction = (typeof CAST_ACTIONS)[number];
export type BindableAction = MovementAction | CastAction;

export const ACTIONS: readonly BindableAction[] = [...MOVEMENT_ACTIONS, ...CAST_ACTIONS];

export const ACTION_LABELS: Record<BindableAction, string> = {
  forward: 'Walk forward',
  back: 'Walk back',
  left: 'Turn left',
  right: 'Turn right',
  jump: 'Jump',
  ascend: 'Swim up',
  descend: 'Swim down',
  cast1: 'Bar slot 1',
  cast2: 'Bar slot 2',
  cast3: 'Bar slot 3',
  cast4: 'Bar slot 4',
  cast5: 'Bar slot 5',
  cast6: 'Bar slot 6',
  cast7: 'Bar slot 7',
  cast8: 'Bar slot 8',
  cast9: 'Bar slot 9',
  cast10: 'Bar slot 10',
};

export type Keybinds = Record<BindableAction, readonly string[]>;

export const DEFAULT_KEYBINDS: Keybinds = {
  forward: ['w', 'arrowup'],
  back: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  jump: [' '],
  ascend: [' '],
  descend: ['shift', 'control'],
  cast1: ['1'],
  cast2: ['2'],
  cast3: ['3'],
  cast4: ['4'],
  cast5: ['5'],
  cast6: ['6'],
  cast7: ['7'],
  cast8: ['8'],
  cast9: ['9'],
  cast10: ['0'],
};

/** A key as the settings screen prints it. */
export function keyLabel(key: string): string {
  const named: Record<string, string> = {
    ' ': 'Space',
    spacebar: 'Space',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    shift: 'Shift',
    control: 'Ctrl',
    alt: 'Alt',
    escape: 'Esc',
    enter: 'Enter',
    tab: 'Tab',
    backspace: 'Backspace',
  };
  return named[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/** `KeyboardEvent.key` as this module stores it. */
export function keyOf(event: { key: string }): string {
  return event.key.toLowerCase();
}

/**
 * A saved set of bindings, checked field by field: an action missing or
 * malformed reverts to its default alone. Keys are lower-cased strings.
 */
export function parseKeybinds(raw: unknown, fallback: Keybinds = DEFAULT_KEYBINDS): Keybinds {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<BindableAction, readonly string[]>;
  for (const action of ACTIONS) {
    const value = record[action];
    out[action] =
      Array.isArray(value) && value.every(k => typeof k === 'string' && k.length > 0)
        ? (value as string[]).map(k => k.toLowerCase())
        : fallback[action];
  }
  return out;
}

/**
 * Bind `key` to `action`, and to nothing else: a key that was elsewhere is
 * taken from there. The action keeps its other keys. Jump and swim-up may
 * share Space, as the defaults do — that pair is the one exception, because
 * one press means both.
 */
export function rebind(binds: Keybinds, action: BindableAction, key: string): Keybinds {
  const k = key.toLowerCase();
  const next = {} as Record<BindableAction, readonly string[]>;
  for (const other of ACTIONS) {
    const keep = other === action || sharesKey(other, action);
    next[other] = keep ? binds[other] : binds[other].filter(existing => existing !== k);
  }
  next[action] = [k];
  return next;
}

function sharesKey(a: BindableAction, b: BindableAction): boolean {
  const pair = new Set<BindableAction>(['jump', 'ascend']);
  return pair.has(a) && pair.has(b);
}

/** The bar socket a cast action stands for, 0-based. */
export function castSlotOf(action: CastAction): number {
  return CAST_ACTIONS.indexOf(action);
}
