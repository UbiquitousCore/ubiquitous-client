/**
 * Reporting a player: a one-off compose at the current target.
 * `reportSent` is set only on the server's acknowledgement, since it can
 * refuse self-reports and blank reasons.
 */

import { signal } from '@preact/signals';

/** Who the compose form is addressed at. Null means the form is shut. */
export const reportTarget = signal<{ id: string; name: string } | null>(null);

/**
 * True once the server has confirmed the report for the open target.
 *
 * Cleared whenever the form is opened or put away, so it never carries over
 * to a different target.
 */
export const reportSent = signal(false);

/**
 * Address the form at one player and bring it up.
 *
 * The plus-menu's report button calls this with the unit it was opened on.
 */
export function beginReport(targetId: string, targetName: string): void {
  reportTarget.value = { id: targetId, name: targetName };
  reportSent.value = false;
}

/** Put the form away, whether or not anything was sent. */
export function closeReport(): void {
  reportTarget.value = null;
  reportSent.value = false;
}

/** How a report reaches the server. Installed by whatever owns one. */
let send: (targetId: string, reason: string) => void = () => {};

export function setReportSink(sink: (targetId: string, reason: string) => void): void {
  send = sink;
}

/** Send the report; nothing for a blank reason. The form confirms only on `acknowledgeReport`. */
export function sendReport(reason: string): void {
  const target = reportTarget.value;
  if (target === null) return;
  const said = reason.trim();
  if (said === '') return;
  send(target.id, said);
}

/** The server confirmed the report; ignored while the form is shut. */
export function acknowledgeReport(): void {
  if (reportTarget.value !== null) reportSent.value = true;
}
