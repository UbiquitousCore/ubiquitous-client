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

  it('takes pointer events on its panel and hovers over the world around it', () => {
    // A click on the window must not target a mob through it; a click
    // beside it reaches the world, and nothing behind it is dimmed.
    const { container } = render(<Dialog label="Mira shop">stock</Dialog>);

    const host = container.querySelector('[role="dialog"]')!;
    expect(container.querySelector('section')!.className).toContain('pointer-events-auto');
    expect(host.className).toContain('pointer-events-none');
    expect(host.className).not.toMatch(/\bbg-/);
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
