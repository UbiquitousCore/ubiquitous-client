/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/useWorn', () => ({
  useWorn: () => ({ image: { url: 'blob:mark', width: 10, height: 10 } }),
}));

import { WornChevrons } from '../../src/ui/art/WornChevrons';
import type { ListSlice } from '../../src/ui/art/wornList';
import type { ListingSpec } from '../../src/ui/art/uiSpec';
import type { Worn } from '../../src/ui/art/useWorn';

afterEach(cleanup);

const list: ListingSpec = {
  view: 'view',
  row: 'view/row',
  fields: {},
  more: { above: 'lineTop', below: 'lineBottom' },
};

const worn = {
  find: (name: string | undefined) =>
    name ? { name, path: name, box: { x: 0, y: 0, w: 10, h: 10 }, draws: true } : undefined,
  box: () => ({ position: 'absolute' }),
} as unknown as Worn;

const slice = (from: number, furthest: number) =>
  ({ from, furthest }) as unknown as ListSlice<unknown>;

describe('the marks that say a list runs on', () => {
  it('shows a mark only the way the list still runs', () => {
    const { container } = render(<WornChevrons worn={worn} list={list} slice={slice(0, 3)} />);
    const marks = [...container.querySelectorAll('[data-list-mark]')];
    expect(marks.map(mark => mark.getAttribute('data-list-mark'))).toEqual(['down']);
  });

  it('draws each smaller than its place, drifting the way it points', () => {
    const { container } = render(<WornChevrons worn={worn} list={list} slice={slice(1, 3)} />);
    const up = container.querySelector('[data-list-mark="up"]')!;
    const down = container.querySelector('[data-list-mark="down"]')!;
    expect(up.className).toContain('scale-(--scale-list-mark)');
    expect(up.className).toContain('motion-safe:animate-nudge-up');
    expect(down.className).toContain('motion-safe:animate-nudge-down');
  });

  it('pages the list when pressed, where the screen lets them be pressed', () => {
    const onStep = vi.fn();
    const { getByLabelText } = render(
      <WornChevrons
        worn={worn}
        list={list}
        slice={slice(1, 3)}
        onStep={onStep}
        labels={{ up: 'Earlier spells', down: 'Later spells' }}
      />,
    );
    fireEvent.click(getByLabelText('Later spells'));
    fireEvent.click(getByLabelText('Earlier spells'));
    expect(onStep.mock.calls).toEqual([['down'], ['up']]);
  });

  it('moves slowly and is drawn smaller than full size', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const theme = readFileSync(path.join(here, '../../src/ui/styles/theme.css'), 'utf8');
    for (const way of ['up', 'down']) {
      const token = new RegExp(`--animate-nudge-${way}:\\s*nudge-${way}\\s+([\\d.]+)(m?s)`).exec(
        theme,
      );
      expect(token, `--animate-nudge-${way}`).not.toBeNull();
      const seconds = Number(token![1]) / (token![2] === 'ms' ? 1000 : 1);
      // A cycle of at least a second reads as a drift, not a flicker.
      expect(seconds).toBeGreaterThanOrEqual(1);
    }
    const scale = /--scale-list-mark:\s*([\d.]+)%/.exec(theme);
    expect(Number(scale?.[1])).toBeLessThan(100);
  });
});
