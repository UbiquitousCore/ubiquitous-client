/** An item tooltip, unpositioned (the opener places it); line tones are meanings, not colours. */

import type { ComponentChildren, JSX } from 'preact';
import { cx } from './cx';
import { IconButton } from './Button';

/** What a line is saying, which is the only thing its colour reports. */
export type TooltipLineTone = 'plain' | 'effect' | 'requirement' | 'warning';

const TONE: Record<TooltipLineTone, string> = {
  plain: 'text-parchment-100',
  effect: 'text-row-active',
  requirement: 'text-row-blocked',
  warning: 'text-status-warning',
};

export interface TooltipLine {
  text: string;
  tone?: TooltipLineTone;
}

export interface ItemTooltipProps {
  title: string;
  /** Tints the title (an item's worth is its name colour); passed in, as the tooltip does not know the item. */
  titleClassName?: string;
  /** "Weapon", "Rank: Primary" — the line straight under the title. */
  subtitle?: string;
  lines?: readonly TooltipLine[];
  /** What can be done with it — a Use button, a Buy button. */
  actions?: ComponentChildren;
  onClose?(): void;
  className?: string;
}

export function ItemTooltip({
  title,
  titleClassName,
  subtitle,
  lines = [],
  actions,
  onClose,
  className,
}: ItemTooltipProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-label={title}
      // The game's card: near-black, a brass frame with a dark inner line, the
      // name on its own row above a rule, then what it says in colour.
      className={cx(
        'pointer-events-auto flex w-56 flex-col gap-1.5 rounded-chrome border-2 border-brass-500',
        'bg-black/90 p-2.5 font-chrome text-xs text-parchment-50 shadow-frame ring-1 ring-black/80 ring-inset',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-parchment-100/30 pb-1.5">
        <h3 className={cx('m-0 min-w-0 text-sm font-bold', titleClassName ?? 'text-parchment-50')}>
          {title}
        </h3>
        {onClose && (
          <IconButton size="sm" label="Close" icon="✕" variant="alert" onClick={onClose} />
        )}
      </div>
      {subtitle && <p className="m-0 text-ink-400">{subtitle}</p>}
      {lines.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {lines.map((line, index) => (
            <li key={`${index}-${line.text}`} className={TONE[line.tone ?? 'plain']}>
              {line.text}
            </li>
          ))}
        </ul>
      )}
      {actions && <div className="flex justify-end gap-2 pt-1">{actions}</div>}
    </div>
  );
}
