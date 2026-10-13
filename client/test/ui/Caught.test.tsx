/** @vitest-environment happy-dom */
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Caught } from '../../src/ui/components/Caught';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Falls(): never {
  throw new Error('drawn wrong');
}

describe('a screen that fails while it is drawing', () => {
  it('puts itself away and leaves what is beside it standing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <div>
        <p>the bar</p>
        <Caught what="bag">
          <Falls />
        </Caught>
      </div>,
    );
    expect(screen.getByText('the bar')).toBeTruthy();
    expect(screen.queryByText('drawn wrong')).toBeNull();
  });

  it('says what fell and why', () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <Caught what="bag">
        <Falls />
      </Caught>,
    );
    const lines = said.mock.calls.map(call => call.join(' ')).join('\n');
    expect(lines).toContain('bag fell');
    expect(lines).toContain('drawn wrong');
  });

  it('draws what it is given while nothing is wrong', () => {
    render(
      <Caught what="bag">
        <p>the screen</p>
      </Caught>,
    );
    expect(screen.getByText('the screen')).toBeTruthy();
  });
});
