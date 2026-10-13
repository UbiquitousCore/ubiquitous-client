/**
 * Reporting a player: one target, one send, no persisted list — see
 * `src/ui/reportStore.ts`'s own doc for why `reportSent` only flips on the
 * server's own acknowledgement, not on `sendReport` itself.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  acknowledgeReport,
  beginReport,
  closeReport,
  reportSent,
  reportTarget,
  sendReport,
  setReportSink,
} from '../../src/ui/reportStore';

beforeEach(() => {
  closeReport();
  setReportSink(() => {});
});

describe('opening the form', () => {
  it('addresses it at one player and brings it up', () => {
    beginReport('mob-1', 'Rock Elemental');

    expect(reportTarget.value).toEqual({ id: 'mob-1', name: 'Rock Elemental' });
    expect(reportSent.value).toBe(false);
  });

  it('starts shut', () => {
    expect(reportTarget.value).toBeNull();
  });
});

describe('sending', () => {
  it('sends the trimmed reason to the addressed target', () => {
    const sent: Array<[string, string]> = [];
    setReportSink((targetId, reason) => sent.push([targetId, reason]));
    beginReport('mob-1', 'Rock Elemental');

    sendReport('  spamming trade chat  ');

    expect(sent).toEqual([['mob-1', 'spamming trade chat']]);
  });

  it('does not flip reportSent on its own — only the server acknowledgement does', () => {
    setReportSink(() => {});
    beginReport('mob-1', 'Rock Elemental');

    sendReport('spamming trade chat');

    expect(reportSent.value).toBe(false);
    expect(reportTarget.value).toEqual({ id: 'mob-1', name: 'Rock Elemental' });
  });

  it('sends nothing at all for a blank reason', () => {
    const sent: Array<[string, string]> = [];
    setReportSink((targetId, reason) => sent.push([targetId, reason]));
    beginReport('mob-1', 'Rock Elemental');

    sendReport('   ');

    expect(sent).toEqual([]);
    expect(reportSent.value).toBe(false);
  });

  it('does nothing when nothing is addressed', () => {
    const sent: Array<[string, string]> = [];
    setReportSink((targetId, reason) => sent.push([targetId, reason]));

    sendReport('spamming trade chat');

    expect(sent).toEqual([]);
    expect(reportSent.value).toBe(false);
  });
});

describe('closing', () => {
  it('puts the form away and forgets the target', () => {
    beginReport('mob-1', 'Rock Elemental');

    closeReport();

    expect(reportTarget.value).toBeNull();
  });

  it('clears reportSent along with the target', () => {
    beginReport('mob-1', 'Rock Elemental');
    acknowledgeReport();

    closeReport();

    expect(reportSent.value).toBe(false);
  });

  it('starts a fresh open with reportSent cleared, even against the same target', () => {
    beginReport('mob-1', 'Rock Elemental');
    acknowledgeReport();
    expect(reportSent.value).toBe(true);

    beginReport('mob-1', 'Rock Elemental');

    expect(reportSent.value).toBe(false);
  });
});

describe('acknowledgement', () => {
  it('flips reportSent while the form is open', () => {
    beginReport('mob-1', 'Rock Elemental');

    acknowledgeReport();

    expect(reportSent.value).toBe(true);
  });

  it('does nothing while the form is shut, so a stray or late one cannot reopen it', () => {
    acknowledgeReport();

    expect(reportTarget.value).toBeNull();
    expect(reportSent.value).toBe(false);
  });
});
