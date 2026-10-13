/**
 * Inspect: another player's character sheet, read-only, from the equipment
 * `Game` already keeps per visible player.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { useWornScreen } from './art/useWorn';
import { WornRowLayer } from './art/WornRowLayer';
import { ArtCharacterWindow, CHARACTER_SCREEN } from './components/ArtCharacterWindow';
import { ArtTryOn } from './components/ArtTryOn';
import { Caught } from './components/Caught';
import { closeInspect, inspecting } from './inspectStore';
import { itemFacts } from './inventoryStore';
import { equipmentHomesFor } from './items';

export function InspectPanelContainer(): JSX.Element | null {
  const target = inspecting.value;
  const sheet = useWornScreen(CHARACTER_SCREEN);
  /**
   * The pieces of theirs the hero is trying on, by entry — null while the
   * fitting room is shut. A piece for a place already tried replaces the
   * one there, the way putting it on would.
   */
  const [trying, setTrying] = useState<number[] | null>(null);
  // A fitting belongs to the sheet it was asked from.
  useEffect(() => setTrying(null), [target?.unitId]);
  const tryOn = (entry: number): void => {
    const home = (one: number): number | undefined =>
      equipmentHomesFor(itemFacts.value.get(one)?.inventoryType ?? 0)[0];
    setTrying(was => [...(was ?? []).filter(one => home(one) !== home(entry)), entry]);
  };
  if (target === null || !sheet) return null;
  return (
    <WornRowLayer>
      <Caught what="inspect">
        <ArtCharacterWindow of={target} onTryOn={tryOn} onClose={closeInspect} />
      </Caught>
      {/* The fitting room, beside the sheet the pieces came from. */}
      {trying !== null && (
        <Caught what="try on">
          <ArtTryOn
            entries={trying}
            onReset={() => setTrying([])}
            onClose={() => setTrying(null)}
          />
        </Caught>
      )}
    </WornRowLayer>
  );
}
