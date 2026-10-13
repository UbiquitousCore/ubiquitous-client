/** Stand the body being made behind the screens; every step asks here, built or worn. */

import { useEffect } from 'preact/hooks';

import { draft, frontEndActions, kinds, outfit, setOutfit } from './frontEndStore';

/** The sex values the wire uses, and which body each race wears for it. */
const FEMALE = 1;

export function usePreviewOfDraft(): void {
  const picked = draft.value;
  const races = kinds.value.races;
  const worn = outfit.value;
  const race = races.find(one => one.race === picked.race) ?? races[0] ?? null;
  const displayInfoId =
    race === null
      ? 0
      : picked.gender === FEMALE
        ? race.femaleDisplayInfoId
        : race.maleDisplayInfoId;

  // What this pairing starts out wearing is the server's answer, and it
  // is asked for afresh whenever the pairing changes — a class is most
  // of what a character looks like at creation.
  useEffect(() => {
    // Nothing until the answer comes: what a character wears is the
    // pairing's, and leaving the last one's kit on means a body that
    // is still dressed as the class it no longer is.
    setOutfit([]);
    if (picked.playerClass > 0) frontEndActions().askOutfit(picked.race, picked.playerClass);
  }, [picked.race, picked.playerClass]);

  useEffect(() => {
    if (race === null) return;
    frontEndActions().preview({
      race: picked.race,
      gender: picked.gender,
      displayInfoId,
      skin: picked.skin,
      hairStyle: picked.hairStyle,
      hairColour: picked.hairColour,
      face: picked.face,
      equipment: [...worn],
    });
  }, [
    picked.race,
    picked.gender,
    picked.skin,
    picked.hairStyle,
    picked.hairColour,
    picked.face,
    displayInfoId,
    worn,
  ]);
}
