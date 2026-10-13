/** Which typeface token a worn field uses, by the face its movie names (`core/lettering.ts` registers them). */

import { signal } from '@preact/signals';

import { onFacesChanged, registeredFaces } from '../../core/lettering';

/** The build's names for its registered typefaces, as a signal a screen redraws on. */
const faceNames = signal(registeredFaces());
onFacesChanged(() => {
  faceNames.value = registeredFaces();
});

/**
 * What to letter a worn field in, given the typeface its movie names.
 *
 * The title token where the field names the build's title face, and the
 * body token everywhere else — including before the files are read, when
 * no name is known yet and both tokens are drawing the fallback anyway.
 */
export function wornLettering(face?: string | null): string {
  const title = faceNames.value.title;
  return face && title && face.toLowerCase() === title.toLowerCase()
    ? 'var(--font-title)'
    : 'var(--font-chrome)';
}
