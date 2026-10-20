/** How many to take off a stack, asked when a held stack is let go on its own slot. */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import { Button } from './Button';
import { Dialog } from './Dialog';

export interface SplitStackPromptProps {
  /** What the stack is called, for the question. */
  name: string;
  /** How many the stack holds; at least two, or there is nothing to split. */
  count: number;
  onSplit(count: number): void;
  onCancel(): void;
}

/** Whole numbers from one to one short of the stack, whatever was typed. */
export function splitCount(typed: string, count: number): number | null {
  const wanted = Math.floor(Number(typed));
  return Number.isFinite(wanted) && wanted >= 1 && wanted < count ? wanted : null;
}

export function SplitStackPrompt({
  name,
  count,
  onSplit,
  onCancel,
}: SplitStackPromptProps): JSX.Element {
  const [typed, setTyped] = useState(String(Math.floor(count / 2)));
  const wanted = splitCount(typed, count);
  const split = (): void => {
    if (wanted !== null) onSplit(wanted);
  };
  return (
    <Dialog label={`Split ${name}`} size="md" className="max-w-xs">
      <h2 className="m-0 text-center font-title text-sm text-parchment-100">{name}</h2>
      <label className="flex items-center justify-center gap-2 pt-3 text-xs text-parchment-200">
        <span>How many?</span>
        <input
          type="number"
          min={1}
          max={count - 1}
          value={typed}
          data-split-count
          autoFocus
          onInput={event => setTyped(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') split();
            if (event.key === 'Escape') onCancel();
          }}
          className={
            'w-16 rounded-chrome-sm border border-brass-600 bg-chrome-950 px-2 py-1 text-center ' +
            'font-chrome text-xs text-parchment-200 shadow-recess' +
            'focus-visible:border-brass-400 focus-visible:outline-none'
          }
        />
        <span>of {count}</span>
      </label>
      <div className="flex justify-center gap-3 pt-4">
        <Button size="lg" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="lg" variant="primary" disabled={wanted === null} onClick={split}>
          Split
        </Button>
      </div>
    </Dialog>
  );
}
