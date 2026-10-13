/** Modal frame (dimmed backdrop + centred panel). Focus not trapped — the
 * opener owns focus management. */

import type { ComponentChildren, JSX } from 'preact';
import { cx } from './cx';

/** How wide the panel is allowed to get before it stops growing. */
export type DialogSize = 'md' | 'lg';

const WIDTH: Record<DialogSize, string> = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export interface DialogProps {
  /** The accessible name of the window. */
  label: string;
  size?: DialogSize;
  children: ComponentChildren;
  className?: string;
  /**
   * Inline style for the backdrop, the box the panel is centred in. A window
   * meant to sit beside the character window passes the edge it covers as
   * `left`, so the panel lands in the part of the screen the player can see.
   */
  hostStyle?: JSX.CSSProperties;
}

export function Dialog({
  label,
  size = 'lg',
  children,
  className,
  hostStyle,
}: DialogProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-label={label}
      className="pointer-events-auto fixed inset-0 z-dialog flex items-center justify-center bg-black/65 p-4"
      style={hostStyle}
    >
      <section
        className={cx(
          'flex max-h-full w-full flex-col overflow-hidden rounded-chrome border border-brass-400',
          'bg-chrome-950 p-4 font-chrome text-xs text-parchment-200 shadow-frame',
          WIDTH[size],
          className,
        )}
      >
        {children}
      </section>
    </div>
  );
}
