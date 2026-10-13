/**
 * The pressable things: a labelled button, and a square or round icon button.
 *
 * Every button in the client comes from here, so that "a brass-edged button on
 * dark chrome" has one definition rather than one per window.
 */

import type { ComponentChildren, JSX } from 'preact';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'alert' | 'mail';

/**
 * `sm` holds the WCAG 2.2 AA 24px floor up through a tablet; `lg` is a full
 * 40px target there. From `xl` up they step up a little further, capped
 * with a matching max-height so nothing overshoots on a very tall screen.
 * `IconButton` keeps its own, unrelated `ICON_BUTTON_SIZE` that never grows
 * this way.
 */
export type ButtonSize = 'sm' | 'md' | 'lg';

/** The overlays built with `createElement` (boot screen, sign-in, admin panel) assign this to `className` directly. */
export const BUTTON_BASE =
  'inline-flex cursor-pointer items-center gap-2 ' +
  'font-chrome whitespace-nowrap transition-[filter] select-none ' +
  'focus-visible:shadow-selected focus-visible:outline-none ' +
  'disabled:cursor-default disabled:opacity-50';

/** Not part of `BUTTON_BASE`: a button whose label runs down a list reads left-aligned instead. */
export const BUTTON_CENTRED = 'justify-center';

/**
 * Variant faces: nine-sliced frame + fill (`danger` uses `row-blocked` for
 * contrast on the dark button face; `mail` carries its own blue). Pinned by
 * `test/ui/theme.contrast.test.ts`.
 */
export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-btn surface-btn-light text-ink-900',
  secondary: 'border-btn-secondary surface-btn-dark text-parchment-200',
  ghost:
    'rounded-chrome border border-transparent text-parchment-200 ' +
    'hover:not-disabled:border-brass-600 hover:not-disabled:bg-chrome-900/60 ' +
    'hover:not-disabled:text-parchment-100',
  danger: 'border-btn-secondary surface-btn-dark text-row-blocked',
  // The red square on the item card: solid, no frame art.
  alert:
    'rounded-chrome-sm border-2 border-ink-danger bg-ink-danger text-parchment-50 shadow-bevel',
  mail: 'border-btn surface-btn-mail text-parchment-100',
};

/**
 * The interaction cue every framed variant shares. Not part of
 * `BUTTON_VARIANT` because `ghost` already has its own hover treatment.
 */
export const BUTTON_PRESSABLE =
  'hover:not-disabled:brightness-110 active:not-disabled:brightness-95';

export const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-6 px-2 text-tiny xl:min-h-11 xl:max-h-11 xl:text-sm',
  md: 'min-h-8 px-3 text-xs xl:min-h-12 xl:max-h-12 xl:text-base',
  lg: 'min-h-10 px-5 text-sm xl:min-h-14 xl:max-h-14 xl:text-lg',
};

/**
 * The picked-out state, for a toggle or the active tab. Appearance only —
 * which ARIA attribute says so is the caller's to pass. Replaces the
 * variant's own face entirely rather than layering over it: two utilities
 * both setting `background-image` on one element is a coin flip, not an
 * override.
 */
const SELECTED =
  'border-btn surface-btn-select border-selected-lit text-parchment-50 shadow-burning';

type NativeButton = Omit<JSX.IntrinsicElements['button'], 'size' | 'class'>;

export interface ButtonProps extends NativeButton {
  variant?: ButtonVariant;
  size?: ButtonSize;
  selected?: boolean;
  children?: ComponentChildren;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  selected = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cx(
        BUTTON_BASE,
        BUTTON_CENTRED,
        selected ? SELECTED : BUTTON_VARIANT[variant],
        variant !== 'ghost' && BUTTON_PRESSABLE,
        BUTTON_SIZE[size],
        typeof className === 'string' ? className : undefined,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** `sm` is 24px, the same WCAG 2.2 AA floor `BUTTON_SIZE.sm` holds. */
export const ICON_BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'size-6 text-tiny',
  md: 'size-8 text-xs',
  lg: 'size-10 text-lg',
};

export interface IconButtonProps extends Omit<ButtonProps, 'children'> {
  /** The accessible name. Required: a glyph is not a label. */
  label: string;
  /** The glyph itself — a character, or an `<img>`. */
  icon: ComponentChildren;
  /** Round rather than slot-shaped, for the map's own controls. */
  round?: boolean;
}

/**
 * `border-image` does not follow `border-radius` in any shipping browser —
 * a round button's frame would render as its own rectangle — while
 * `background-image` does clip to it correctly. A round button keeps its
 * fill and wears a plain brass ring in place of the frame art.
 */
function iconButtonFace(face: string, round: boolean): string {
  if (!round) return face;
  return face
    .replace('border-btn-secondary', 'border border-brass-600')
    .replace('border-btn', 'border border-brass-600');
}

export function IconButton({
  label,
  icon,
  round = false,
  variant = 'secondary',
  size = 'md',
  selected = false,
  className,
  type = 'button',
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <button
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      className={cx(
        BUTTON_BASE,
        BUTTON_CENTRED,
        iconButtonFace(selected ? SELECTED : BUTTON_VARIANT[variant], round),
        variant !== 'ghost' && BUTTON_PRESSABLE,
        ICON_BUTTON_SIZE[size],
        round && 'rounded-full',
        'shrink-0 p-0 leading-none',
        typeof className === 'string' ? className : undefined,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
