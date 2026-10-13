/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Slot } from '../../src/ui/components/Slot';

afterEach(cleanup);

describe('Slot', () => {
  it.each([
    ['sm', 'size-7'],
    ['md', 'size-9'],
    ['lg', 'size-11'],
    ['xl', 'size-12'],
  ] as const)('draws %s as one fixed square', (size, expected) => {
    // A slot that takes its size from its container is a slot whose size
    // depends on which bar it happens to be inside.
    const { container } = render(<Slot size={size} />);

    expect(container.querySelector('button')!.className).toContain(expected);
  });

  it('is a hole rather than a raised face', () => {
    const { container } = render(<Slot />);

    expect(container.querySelector('button')!.className).toContain('shadow-recess');
  });

  it('reports presses, and stops while disabled', () => {
    const onClick = vi.fn();
    const { container, rerender } = render(<Slot onClick={onClick} />);

    fireEvent.click(container.querySelector('button')!);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<Slot disabled onClick={onClick} />);
    fireEvent.click(container.querySelector('button')!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('marks the selected one with the same glow as focus', () => {
    // One "this is the one" language for casting, assigning and focusing.
    const { container } = render(<Slot selected />);

    expect(container.querySelector('button')!.className).toMatch(/(^| )shadow-selected( |$)/);
  });

  it.each([
    ['dark', 'bg-chrome-900/90'],
    ['light', 'surface-slot'],
  ] as const)('cuts the socket into the %s surface it sits on', (tone, expected) => {
    // The HUD floats over the world and the screens are paper. A socket that
    // wore one face on both would be a hole in the wrong material.
    const { container } = render(<Slot tone={tone} />);

    expect(container.querySelector('button')!.className).toContain(expected);
  });

  it('clips whatever is put in it', () => {
    // The icon fills the socket, and a cooldown sweep is drawn over it — both
    // have to stop at the socket's own rounded edge.
    const { container } = render(
      <Slot>
        <img alt="" src="spell.png" />
      </Slot>,
    );

    const button = container.querySelector('button')!;
    expect(button.className).toContain('overflow-hidden');
    expect(button.className).toContain('relative');
    expect(button.querySelector('img')).toBeTruthy();
  });
});
