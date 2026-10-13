/** @vitest-environment happy-dom */
/**
 * The field a player types into on a screen wearing the shipped art.
 *
 * It exists because of one line: the lettering a field is drawn with
 * carries `pointer-events: none` — right for a caption, which must not
 * be in the way of the control under it, and fatal for an input. Spread
 * whole onto the input, it left a sign-in panel nobody could click.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WornField } from '../../src/ui/frontend/wornBits';
import type { PiecePart } from '../../src/ui/art/piecePlan';
import type { Worn } from '../../src/ui/art/useWorn';

afterEach(cleanup);

const part: PiecePart = {
  name: 'inputAccount',
  path: 'login_panel/inputAccount',
  box: { x: 10, y: 20, w: 100, h: 16 },
  draws: false,
  text: { align: 'left', sizePx: 12, color: '#332211', face: null, words: '' },
};

/** Only what the field asks of a screen: where a part is, and its lettering. */
function stubWorn(): Worn {
  return {
    frame: { x: 0, y: 0, w: 200, h: 200 },
    placedAt: null,
    placed: {},
    whole: [part],
    image: null,
    parts: [part],
    scale: 1,
    sharper: 1,
    pictureRef: { current: null },
    sized: {},
    find: () => part,
    fieldOf: () => part,
    box: () => ({ position: 'absolute', left: '5%', top: '10%', width: '50%', height: '8%' }),
    // The production `Worn` says this, and it is the whole point of the test.
    words: () => ({ fontSize: '12px', color: '#332211', pointerEvents: 'none' }),
  } as unknown as Worn;
}

describe('a field on a worn screen', () => {
  it('can be typed into', () => {
    const changed = vi.fn();
    render(<WornField worn={stubWorn()} part={part} label="Account" value="" onChange={changed} />);

    const field = screen.getByLabelText('Account');
    expect(field.style.pointerEvents, 'a control nothing can point at is no control').not.toBe(
      'none',
    );

    fireEvent.input(field, { target: { value: 'developer' } });
    expect(changed).toHaveBeenCalledWith('developer');
  });

  it('is drawn in the lettering its own place was drawn in', () => {
    render(
      <WornField worn={stubWorn()} part={part} label="Account" value="" onChange={() => {}} />,
    );

    const field = screen.getByLabelText('Account');
    expect(field.style.fontSize).toBe('12px');
    expect(field.style.position).toBe('absolute');
  });

  it('hides what is typed into a secret one, and holds it to its own length', () => {
    render(
      <WornField
        worn={stubWorn()}
        part={part}
        label="Password"
        value=""
        secret
        limit={20}
        onChange={() => {}}
      />,
    );

    const field = screen.getByLabelText('Password') as HTMLInputElement;
    expect(field.type).toBe('password');
    expect(field.maxLength).toBe(20);
  });

  it('draws nothing where the movie has no such place', () => {
    const { container } = render(
      <WornField worn={stubWorn()} part={undefined} label="Account" value="" onChange={() => {}} />,
    );

    expect(container.querySelector('input')).toBeNull();
  });
});
