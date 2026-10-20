/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SplitStackPrompt, splitCount } from '../../src/ui/components/SplitStackPrompt';

afterEach(cleanup);

describe('splitCount', () => {
  it('takes whole numbers from one to one short of the stack', () => {
    expect(splitCount('3', 5)).toBe(3);
    expect(splitCount('4.7', 5)).toBe(4);
    expect(splitCount('5', 5)).toBeNull();
    expect(splitCount('0', 5)).toBeNull();
    expect(splitCount('', 5)).toBeNull();
  });
});

describe('SplitStackPrompt', () => {
  it('offers half the stack, and splits off what is typed on Enter', () => {
    const onSplit = vi.fn();
    const { getByRole } = render(
      <SplitStackPrompt name="Armor Scraps" count={9} onSplit={onSplit} onCancel={() => {}} />,
    );
    const field = getByRole('spinbutton') as HTMLInputElement;
    expect(field.value).toBe('4');
    fireEvent.input(field, { target: { value: '7' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSplit).toHaveBeenCalledWith(7);
  });

  it('will not split off the whole stack', () => {
    const onSplit = vi.fn();
    const { getByRole } = render(
      <SplitStackPrompt name="Armor Scraps" count={3} onSplit={onSplit} onCancel={() => {}} />,
    );
    fireEvent.input(getByRole('spinbutton'), { target: { value: '3' } });
    expect((getByRole('button', { name: 'Split' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
