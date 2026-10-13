/** Report a player: target, reason, send, confirmation. Never written to chat. */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import { Button } from './components/Button';
import { cx } from './components/cx';
import { Dialog } from './components/Dialog';
import { closeReport, reportSent, reportTarget, sendReport } from './reportStore';

/** Long enough for a real explanation, short enough to stop a wall of text. */
const MAX_REASON = 500;

export function ReportPlayerContainer(): JSX.Element | null {
  const target = reportTarget.value;
  const sent = reportSent.value;
  const [reason, setReason] = useState('');
  if (target === null) return null;

  const close = (): void => {
    setReason('');
    closeReport();
  };

  if (sent) {
    return (
      <Dialog label="Report sent" size="md">
        <h2 className="m-0 text-center font-title text-sm text-parchment-100">Report sent</h2>
        <p className="m-0 pt-2 text-center text-tiny text-ink-400">
          Your report against {target.name} has been sent.
        </p>
        <div className="flex justify-center pt-4">
          <Button size="lg" variant="primary" onClick={close}>
            Close
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog label={`Report ${target.name}`} size="md">
      <h2 className="m-0 text-center font-title text-sm text-parchment-100">Report player</h2>
      <p className="m-0 pt-3 text-xs text-parchment-200">
        Player{' '}
        <span data-report-target className="font-bold text-parchment-100">
          {target.name}
        </span>
      </p>
      <label className="flex flex-col gap-1 pt-3 text-xs text-parchment-200">
        <span>Reason</span>
        <textarea
          value={reason}
          maxLength={MAX_REASON}
          data-report-reason
          autoFocus
          rows={4}
          onInput={event => setReason(event.currentTarget.value)}
          className={cx(
            'min-w-0 flex-1 resize-none rounded-chrome-sm border border-brass-600 bg-chrome-950 px-2 py-1',
            'font-chrome text-xs text-parchment-200 shadow-recess',
            'focus-visible:border-brass-400 focus-visible:outline-none',
          )}
        />
      </label>
      <div className="flex justify-center gap-3 pt-4">
        <Button size="lg" variant="secondary" className="text-parchment-50" onClick={close}>
          Cancel
        </Button>
        <Button
          size="lg"
          variant="primary"
          disabled={reason.trim() === ''}
          onClick={() => sendReport(reason)}
        >
          Send
        </Button>
      </div>
    </Dialog>
  );
}
