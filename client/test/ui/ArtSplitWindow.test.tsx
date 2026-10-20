/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArtSplitWindow } from '../../src/ui/components/ArtSplitWindow';
import { uiSpec } from '../../src/ui/art/uiSpec';

afterEach(() => {
  cleanup();
  uiSpec.value = null;
});

describe('ArtSplitWindow', () => {
  it('asks on the client’s own box where the build has no split box', () => {
    const onSplit = vi.fn();
    const { getByRole } = render(
      <ArtSplitWindow name="Armor Scraps" count={6} onSplit={onSplit} onCancel={() => {}} />,
    );
    fireEvent.click(getByRole('button', { name: 'Split' }));
    expect(onSplit).toHaveBeenCalledWith(3);
  });
});
