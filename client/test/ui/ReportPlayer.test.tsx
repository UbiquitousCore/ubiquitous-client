/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { ReportPlayerContainer } from '../../src/ui/ReportPlayerContainer';
import {
  acknowledgeReport,
  beginReport,
  closeReport,
  setReportSink,
} from '../../src/ui/reportStore';

afterEach(() => {
  cleanup();
  closeReport();
  setReportSink(() => {});
});

function button(container: Element, label: string): HTMLButtonElement {
  return [...container.querySelectorAll('button')].find(b => b.textContent === label)!;
}

describe('ReportPlayerContainer', () => {
  it('stays shut until the plus-menu opens it', () => {
    const { container } = render(<ReportPlayerContainer />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('names the target it was addressed at', () => {
    beginReport('mob-1', 'Rock Elemental');
    const { container } = render(<ReportPlayerContainer />);
    expect(container.querySelector('[data-report-target]')?.textContent).toBe('Rock Elemental');
  });

  it('will not send with no reason typed', () => {
    beginReport('mob-1', 'Rock Elemental');
    const { container } = render(<ReportPlayerContainer />);
    expect(button(container, 'Send').disabled).toBe(true);
    fireEvent.input(container.querySelector('[data-report-reason]')!, { target: { value: '  ' } });
    expect(button(container, 'Send').disabled).toBe(true);
    fireEvent.input(container.querySelector('[data-report-reason]')!, {
      target: { value: 'spamming trade chat' },
    });
    expect(button(container, 'Send').disabled).toBe(false);
  });

  it('sends the typed reason against the addressed target', () => {
    const sent: Array<[string, string]> = [];
    setReportSink((targetId, reason) => sent.push([targetId, reason]));
    beginReport('mob-1', 'Rock Elemental');
    const { container } = render(<ReportPlayerContainer />);

    fireEvent.input(container.querySelector('[data-report-reason]')!, {
      target: { value: 'spamming trade chat' },
    });
    fireEvent.click(button(container, 'Send'));

    expect(sent).toEqual([['mob-1', 'spamming trade chat']]);
  });

  it('does not show a confirmation on Send alone — only once the server acknowledges it', () => {
    setReportSink(() => {});
    beginReport('mob-1', 'Rock Elemental');
    const { container, queryByText } = render(<ReportPlayerContainer />);

    fireEvent.input(container.querySelector('[data-report-reason]')!, {
      target: { value: 'spamming trade chat' },
    });
    fireEvent.click(button(container, 'Send'));

    expect(queryByText(/Report sent/)).toBeNull();
  });

  it('shows a confirmation once the server acknowledges it, in place of the compose form', () => {
    setReportSink(() => {});
    beginReport('mob-1', 'Rock Elemental');
    const { container, getByText } = render(<ReportPlayerContainer />);

    fireEvent.input(container.querySelector('[data-report-reason]')!, {
      target: { value: 'spamming trade chat' },
    });
    fireEvent.click(button(container, 'Send'));
    act(() => acknowledgeReport());

    expect(container.querySelector('[data-report-reason]')).toBeNull();
    expect(getByText(/Report sent/)).toBeTruthy();
  });

  it('closes without sending on Cancel', () => {
    const sent: Array<[string, string]> = [];
    setReportSink((targetId, reason) => sent.push([targetId, reason]));
    beginReport('mob-1', 'Rock Elemental');
    const { container } = render(<ReportPlayerContainer />);

    fireEvent.click(button(container, 'Cancel'));

    expect(sent).toEqual([]);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes from the confirmation, which puts the whole form away', () => {
    setReportSink(() => {});
    beginReport('mob-1', 'Rock Elemental');
    const { container } = render(<ReportPlayerContainer />);

    fireEvent.input(container.querySelector('[data-report-reason]')!, {
      target: { value: 'spamming trade chat' },
    });
    fireEvent.click(button(container, 'Send'));
    act(() => acknowledgeReport());
    fireEvent.click(button(container, 'Close'));

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
