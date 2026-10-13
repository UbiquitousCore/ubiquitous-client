/** Confirm dialog (subject on its own line in item colour). For irreversible
 * actions the server will not ask about (e.g. destroy). */

import type { ComponentChildren, JSX } from 'preact';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { cx } from './cx';

export interface ConfirmDialogProps {
  /** The question, in words: "Destroy this item?" */
  question: string;
  /** What it is about — an item's name. Drawn on its own line. */
  subject?: string;
  /** A utility that tints the subject, from the item's quality. */
  subjectClassName?: string;
  /** Anything else the player should know before deciding. */
  children?: ComponentChildren;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({
  question,
  subject,
  subjectClassName,
  children,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  return (
    <Dialog label={question} size="md">
      <h2 className="m-0 text-center font-title text-sm text-parchment-100">{question}</h2>
      {subject && (
        <p className={cx('m-0 pt-2 text-center text-sm font-bold', subjectClassName)}>{subject}</p>
      )}
      {children && <div className="pt-2 text-center text-tiny text-ink-400">{children}</div>}
      <div className="flex justify-center gap-3 pt-4">
        {/* The destructive one is not the default focus and is not first:
            a confirmation that puts "yes" under the thumb is not one. */}
        <Button size="lg" variant="secondary" className="text-parchment-50" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button size="lg" variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
