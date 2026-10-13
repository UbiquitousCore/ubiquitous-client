/** @vitest-environment happy-dom */

/**
 * The instance badge lives directly in the HUD rather than in a container,
 * so this pins that `GameHud` draws it from the store.
 */

import { cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GameHud } from '../../src/ui/GameHud';
import {
  applyWorldEntered,
  noteInstanceRequested,
  resetInstance,
} from '../../src/ui/instanceStore';

beforeEach(() => {
  resetInstance();
});

afterEach(() => {
  cleanup();
  resetInstance();
});

describe('the instance badge', () => {
  it('stays off in the open world', () => {
    const { container } = render(<GameHud />);
    expect(container.querySelector('[data-hud="instance"]')).toBeNull();
  });

  it('names the map once this session believes it is in a copy of one', () => {
    noteInstanceRequested(30);
    applyWorldEntered(30);
    const { container } = render(<GameHud />);
    const badge = container.querySelector('[data-hud="instance"]');
    expect(badge?.textContent).toContain('30');
    // The badge must keep saying the state is inferred: no server field
    // reports it, and a flat claim would be a lie the moment that changes.
    expect(badge?.textContent).toMatch(/inferred/i);
  });

  it('goes out on a world entry this session did not ask for', () => {
    noteInstanceRequested(30);
    applyWorldEntered(30);
    applyWorldEntered(1);
    const { container } = render(<GameHud />);
    expect(container.querySelector('[data-hud="instance"]')).toBeNull();
  });
});
