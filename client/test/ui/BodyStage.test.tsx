/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CharacterBody, setBodyStageSource } from '../../src/ui/components/BodyStage';
import type { StagedBody } from '../../src/ui/components/BodyStage';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setBodyStageSource(() => null);
});

function stub(): StagedBody & { sync: () => void; dispose: () => void } {
  const element = document.createElement('div');
  element.dataset.stagedBody = '';
  return { element, sync: vi.fn(), dispose: vi.fn() };
}

describe('CharacterBody', () => {
  it('stages the body the source hands over, and releases it on unmount', () => {
    const staged = stub();
    setBodyStageSource(() => staged);
    const { container, unmount } = render(<CharacterBody />);

    expect(container.querySelector('[data-staged-body]')).not.toBeNull();
    unmount();
    expect(staged.dispose).toHaveBeenCalledOnce();
  });

  it('stays empty without a source, the way the design lab renders it', () => {
    const { container } = render(<CharacterBody />);

    expect(container.querySelector('[data-character-body]')).not.toBeNull();
    expect(container.querySelector('[data-staged-body]')).toBeNull();
  });

  it('keeps asking until the body is built, then keeps it current', () => {
    vi.useFakeTimers();
    const staged = stub();
    let ready = false;
    setBodyStageSource(() => (ready ? staged : null));
    const { container } = render(<CharacterBody />);

    expect(container.querySelector('[data-staged-body]')).toBeNull();
    ready = true;
    vi.advanceTimersByTime(1000);
    expect(container.querySelector('[data-staged-body]')).not.toBeNull();
    vi.advanceTimersByTime(2000);
    expect(staged.sync).toHaveBeenCalledTimes(2);
  });
});
