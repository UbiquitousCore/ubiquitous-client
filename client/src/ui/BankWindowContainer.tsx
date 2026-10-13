/** The bank window's container: the strongbox and the bag side by side, on the build's own screen. */

import type { JSX } from 'preact';
import { ArtStorageWindow, STORAGE_SCREEN } from './components/ArtStorageWindow';
import { useWornScreen } from './art/useWorn';
import { bankOpen, closeBank } from './inventoryStore';

export function BankWindowContainer(): JSX.Element | null {
  // Asked before anything else this draws, so the same number of hooks
  // runs whether the window is open or shut.
  const worn = useWornScreen(STORAGE_SCREEN);
  if (!bankOpen.value || !worn) return null;
  return <ArtStorageWindow onClose={closeBank} />;
}
