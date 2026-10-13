/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUTTON_BASE,
  BUTTON_SIZE,
  BUTTON_VARIANT,
  Button,
  IconButton,
} from '../../src/ui/components/Button';

afterEach(cleanup);

/**
 * The button is where a design system either holds or leaks: it is the most
 * copied element in any interface, and every copy is a chance for a border
 * colour or a padding to drift. What is pinned here is that the variants stay
 * distinguishable, that a disabled button cannot be pressed, and that the
 * states the eye relies on are actually applied.
 */
describe('Button', () => {
  it('is a real button, and reports presses', () => {
    const onClick = vi.fn();
    const { container } = render(<Button onClick={onClick}>Buy</Button>);

    const button = container.querySelector('button')!;
    expect(button.type).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire while disabled', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button disabled onClick={onClick}>
        Buy
      </Button>,
    );

    fireEvent.click(container.querySelector('button')!);
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'ghost'] as const)('draws the %s face', variant => {
    const { container } = render(<Button variant={variant}>Buy</Button>);

    const className = container.querySelector('button')!.className;
    expect(className).toContain(BUTTON_VARIANT[variant].split(' ')[0]);
  });

  it.each(['sm', 'md', 'lg'] as const)('holds a minimum height at %s', size => {
    const { container } = render(<Button size={size}>Buy</Button>);

    // A button that can shrink below its size is a button somebody cannot hit.
    expect(container.querySelector('button')!.className).toContain(BUTTON_SIZE[size].split(' ')[0]);
  });

  it('shows the picked-out state without inventing the ARIA for it', () => {
    // `selected` is appearance. Whether that means pressed or selected depends
    // on what the button is, which only the caller knows.
    const { container } = render(
      <Button selected aria-pressed>
        World map
      </Button>,
    );

    const button = container.querySelector('button')!;
    expect(button.className).toContain('shadow-burning');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps a visible focus ring', () => {
    // Removing the outline without replacing it strands keyboard users.
    const { container } = render(<Button>Buy</Button>);

    const className = container.querySelector('button')!.className;
    expect(className).toContain('focus-visible:shadow-selected');
    expect(className).toContain('focus-visible:outline-none');
  });

  it('takes extra classes from the caller without losing its own', () => {
    const { container } = render(<Button className="absolute bottom-4">Buy</Button>);

    const className = container.querySelector('button')!.className;
    expect(className).toContain('absolute');
    expect(className).toContain(BUTTON_BASE.split(' ')[0]);
  });
});

describe('IconButton', () => {
  it('names itself, because a glyph is not a label', () => {
    const { container } = render(<IconButton label="Close map" icon="↩" />);

    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Close map');
    // And the same words as a tooltip for everyone else.
    expect(button.getAttribute('title')).toBe('Close map');
    expect(button.textContent).toBe('↩');
  });

  it('lets a caller override the tooltip while keeping the accessible name', () => {
    // The map's paging button reads "1/2" but is called "Next page".
    const { container } = render(<IconButton label="Next page" icon="1/2" title="Page 1 of 2" />);

    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Next page');
    expect(button.getAttribute('title')).toBe('Page 1 of 2');
  });

  it('is square, and round when asked', () => {
    const { container } = render(<IconButton round label="Close map" icon="↩" size="lg" />);

    const className = container.querySelector('button')!.className;
    expect(className).toContain('size-10');
    expect(className).toContain('rounded-full');
  });
});
