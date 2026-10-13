/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog } from '../../src/ui/components/Dialog';

afterEach(cleanup);

describe('Dialog', () => {
  it('announces itself as a named dialog', () => {
    const { container } = render(<Dialog label="Mira shop">stock</Dialog>);

    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('Mira shop');
    expect(dialog.textContent).toContain('stock');
  });

  it('takes pointer events back from the HUD', () => {
    // The HUD passes clicks through to the world; a modal must not, or the
    // player targets a mob through the window they are reading.
    const { container } = render(<Dialog label="Mira shop">stock</Dialog>);

    expect(container.querySelector('[role="dialog"]')!.className).toContain('pointer-events-auto');
  });

  it('never grows past the viewport, whatever is inside it', () => {
    const { container } = render(
      <Dialog label="Mira shop">
        {Array.from({ length: 200 }, (_, index) => (
          <p key={index}>row</p>
        ))}
      </Dialog>,
    );

    const panel = container.querySelector('section')!;
    expect(panel.className).toContain('max-h-full');
    expect(panel.className).toContain('overflow-hidden');
  });

  it.each([
    ['md', 'max-w-lg'],
    ['lg', 'max-w-2xl'],
  ] as const)('stops widening at %s', (size, expected) => {
    const { container } = render(
      <Dialog label="Mira shop" size={size}>
        stock
      </Dialog>,
    );

    expect(container.querySelector('section')!.className).toContain(expected);
  });

  it('sits above the map, so a confirm opens over the map that asked for it', () => {
    const { container } = render(<Dialog label="Travel to Test Harbour?">fare</Dialog>);

    expect(container.querySelector('[role="dialog"]')!.className).toContain('z-dialog');
  });
});
