/** The recessed socket for an icon; size and surface are props, contents the caller's. */

import type { ComponentChildren, JSX } from 'preact';
import { cx } from './cx';

/**
 * `xl` is the bag and the equipment sheet, `lg` the saved bar, `md` the
 * pop-out bar, `sm` the spell book's picker.
 */
export type SlotSize = 'sm' | 'md' | 'lg' | 'xl';

/** Which surface the socket is cut into: the dark HUD, or a parchment screen. */
export type SlotTone = 'dark' | 'light';

const SIZE: Record<SlotSize, string> = {
  sm: 'size-7',
  md: 'size-9',
  lg: 'size-11',
  xl: 'size-12',
};

const TONE: Record<SlotTone, string> = {
  // `brass-600`, not the darker divider brown: a socket's edge is what says
  // where the target is, so it owes 3:1 against the face inside it.
  dark: 'border-brass-600 bg-chrome-900/90 hover:not-disabled:border-brass-400',
  light: 'border-parchment-700 surface-slot hover:not-disabled:border-title',
};

type NativeButton = Omit<JSX.IntrinsicElements['button'], 'size' | 'class'>;

export interface SlotProps extends NativeButton {
  size?: SlotSize;
  tone?: SlotTone;
  /** Picked out — the slot being assigned to, or the spell being cast. */
  selected?: boolean;
  children?: ComponentChildren;
}

export function Slot({
  size = 'lg',
  tone = 'dark',
  selected = false,
  className,
  type = 'button',
  children,
  ...rest
}: SlotProps): JSX.Element {
  return (
    <button
      type={type}
      className={cx(
        'relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden p-0',
        'rounded-chrome-sm border shadow-recess',
        'transition-colors focus-visible:shadow-selected focus-visible:outline-none',
        'disabled:cursor-default disabled:opacity-50',
        SIZE[size],
        TONE[tone],
        selected && 'border-brass-300 shadow-selected',
        typeof className === 'string' ? className : undefined,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
