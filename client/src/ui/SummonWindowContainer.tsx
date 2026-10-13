/** The summon stone's window: the server's list of members, each press a request. */

import type { JSX } from 'preact';

import { useWornScreen } from './art/useWorn';
import { ArtSummonWindow, SUMMON_SCREEN } from './components/ArtSummonWindow';
import { closeSummonWindow, summonMember, summonWindow } from './summonStore';

export function SummonWindowContainer(): JSX.Element | null {
  // Asked before anything else, so the same hooks run open or shut.
  const worn = useWornScreen(SUMMON_SCREEN);
  const open = summonWindow.value;
  if (!open || !worn) return null;

  return (
    <ArtSummonWindow
      rows={open.members.map(member => ({
        name: member.name,
        canSummon: member.canSummon,
        onPick: () => summonMember(member.networkId),
      }))}
      onClose={closeSummonWindow}
    />
  );
}
