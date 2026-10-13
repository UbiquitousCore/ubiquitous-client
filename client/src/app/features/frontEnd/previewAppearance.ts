import type { IdOf } from '../../../assets/ids';
import type { PreviewLook } from '../../../ui/frontend/frontEndStore';

/** What to ask the asset layer for to stand a look on the ground. */
export function previewAppearanceFor(look: PreviewLook): Omit<IdOf<'networkAppearance'>, 'kind'> {
  return {
    entry: 0,
    displayInfoId: look.displayInfoId,
    race: look.race,
    gender: look.gender,
    skin: look.skin,
    face: look.face,
    hairStyle: look.hairStyle,
    hairColor: look.hairColour,
    equipment: look.equipment ?? [],
    animationId: 0,
  };
}
