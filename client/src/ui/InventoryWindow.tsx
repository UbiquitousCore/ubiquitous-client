/** The character window: the menu bar with the screen it opened beside it, each wearing the build's own art. */

import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { ArtBagWindow, BAG_SCREEN } from './components/ArtBagWindow';
import { Caught } from './components/Caught';
import { refreshSocialLists } from './socialListStore';
import { ArtMenuBar } from './components/ArtMenuBar';
import { WornRowLayer } from './art/WornRowLayer';
import { ArtCharacterWindow, CHARACTER_SCREEN } from './components/ArtCharacterWindow';
import { ArtQuestLogWindow, QUEST_LOG_SCREEN } from './components/ArtQuestLogWindow';
import { ArtSocialWindow, SOCIAL_SCREEN } from './components/ArtSocialWindow';
import { ArtSpellsWindow, SPELLS_SCREEN } from './components/ArtSpellsWindow';
import { ArtOptionsWindow, OPTIONS_SCREEN } from './components/ArtOptionsWindow';
import { ArtTeamWindow, TEAM_SCREEN } from './components/ArtTeamWindow';
import { useWornScreen } from './art/useWorn';
import { classTrees, talentPlaces, wantTalentWords } from '../gameplay/SpellBook';
import { wantEmblems } from './art/pieceStore';
import { heroClass } from './hudStore';
import { guildActions } from './guildStore';
import type { ScreenId } from './screenIds';

export interface InventoryWindowProps {
  screen: ScreenId;
  onScreenChange(screen: ScreenId): void;
  onClose(): void;
}

export function InventoryWindow({
  screen,
  onScreenChange,
  onClose,
}: InventoryWindowProps): JSX.Element | null {
  // Asked before anything else this draws, so the same number of hooks
  // runs whichever screen is open.
  const wornBag = useWornScreen(BAG_SCREEN);
  const wornSheet = useWornScreen(CHARACTER_SCREEN);
  const wornQuests = useWornScreen(QUEST_LOG_SCREEN);
  const wornSpells = useWornScreen(SPELLS_SCREEN);
  const wornSocial = useWornScreen(SOCIAL_SCREEN);
  const wornTeam = useWornScreen(TEAM_SCREEN);
  const wornOptions = useWornScreen(OPTIONS_SCREEN);
  const heroTrees = classTrees.value.get(heroClass.value) ?? [];
  const heroPlaces = talentPlaces.value.filter(place => heroTrees.includes(place.classId));
  // The words and pictures a tree is drawn with are asked for once the
  // spell book is open, not on every other screen.
  useEffect(() => {
    if (screen !== 'spells' || heroPlaces.length === 0) return;
    wantTalentWords(heroPlaces.flatMap(place => [place.says, place.says + 1]));
    wantEmblems(heroPlaces.map(place => place.icon));
  }, [screen, heroPlaces.length]);
  // Membership is persisted server-side and survives a restart, so a fresh
  // session knows nothing until it asks — opening the social window asks.
  useEffect(() => {
    if (screen === 'social') {
      guildActions().refreshRoster();
      refreshSocialLists();
    }
  }, [screen]);

  // The shipped screens stand on one stage with the menu beside them,
  // so both stay up at once — the bar does not go
  // away when a screen is picked, and the screen opens next to it.
  const wornScreen =
    screen === 'bag' && wornBag ? (
      <ArtBagWindow onClose={onClose} />
    ) : screen === 'character' && wornSheet ? (
      <ArtCharacterWindow onClose={onClose} />
    ) : screen === 'quests' && wornQuests ? (
      <ArtQuestLogWindow onClose={onClose} />
    ) : screen === 'spells' && wornSpells ? (
      <ArtSpellsWindow onClose={onClose} />
    ) : screen === 'social' && wornSocial ? (
      <ArtSocialWindow onClose={onClose} />
    ) : screen === 'team' && wornTeam ? (
      <ArtTeamWindow onClose={onClose} />
    ) : screen === 'options' && wornOptions ? (
      <ArtOptionsWindow onClose={onClose} />
    ) : null;
  if (!wornScreen) return null;
  return (
    // Against the left edge with the screen beside it, which is where
    // the bar stands, and the only screens that shift the view: they
    // stay up while play carries on, so the view keeps the hero in
    // what is left of it.
    <WornRowLayer>
      <ArtMenuBar activeId={screen} onPick={onScreenChange} onDismiss={onClose} />
      {/* A screen that throws while it is drawing puts itself away and
          says why, rather than taking the bar and the rest of the
          interface down with it. */}
      <Caught what={screen}>{wornScreen}</Caught>
    </WornRowLayer>
  );
}
