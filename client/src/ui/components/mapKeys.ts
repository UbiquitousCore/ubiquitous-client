/**
 * The keys that open and shut the map.
 */

import { useEffect } from 'preact/hooks';

import { isTextEntry } from '../../core/textEntry';
import { closeMap, mapOpen, openMap } from '../hudStore';

/**
 * Whether a key press opens or shuts the map: M, with no modifier, and not
 * while something is being typed — M in the chat box is a letter. Some key
 * sources (IME, autofill, virtual keyboards) fire with no key at all, and
 * there is nothing to match.
 */
export function mapKeyToggles(event: KeyboardEvent): boolean {
  if (isTextEntry(event.target)) return false;
  const key = event.key?.toLowerCase();
  return key === 'm' && !event.ctrlKey && !event.altKey && !event.metaKey;
}

/** M opens and shuts the map; Escape shuts it. */
export function useMapKeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && mapOpen.value) closeMap();
      if (mapKeyToggles(event)) {
        if (mapOpen.value) closeMap();
        else openMap();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
