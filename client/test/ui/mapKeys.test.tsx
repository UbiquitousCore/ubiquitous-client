/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { mapKeyToggles, useMapKeys } from '../../src/ui/components/mapKeys';
import { closeMap, mapOpen, openMap } from '../../src/ui/hudStore';

function press(
  key: string,
  target: EventTarget | null = document.body,
  extra: Partial<KeyboardEvent> = {},
) {
  return { key, ctrlKey: false, altKey: false, metaKey: false, target, ...extra } as KeyboardEvent;
}

describe('the map key', () => {
  it('opens or shuts the map on M', () => {
    expect(mapKeyToggles(press('m'))).toBe(true);
    expect(mapKeyToggles(press('M'))).toBe(true);
  });

  it('leaves M to a field being typed in, such as the chat box', () => {
    const box = document.createElement('input');
    expect(mapKeyToggles(press('m', box))).toBe(false);
  });

  it('leaves M alone with a modifier held', () => {
    expect(mapKeyToggles(press('m', document.body, { ctrlKey: true }))).toBe(false);
  });
});

function Keys(): null {
  useMapKeys();
  return null;
}

describe('the map keys at work', () => {
  afterEach(() => {
    cleanup();
    closeMap();
  });

  it('M opens the map and M shuts it again', () => {
    render(<Keys />);
    fireEvent.keyDown(window, { key: 'm' });
    expect(mapOpen.value).toBe(true);
    fireEvent.keyDown(window, { key: 'm' });
    expect(mapOpen.value).toBe(false);
  });

  it('Escape shuts an open map and does nothing to a shut one', () => {
    render(<Keys />);
    openMap();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mapOpen.value).toBe(false);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mapOpen.value).toBe(false);
  });
});
