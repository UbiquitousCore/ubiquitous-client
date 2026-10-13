/**
 * Keep the stylesheet's texture slots pointed at the interface sprites cut
 * from the player's own files. Until any arrive every slot stays `none` and
 * each surface shows the plain tint `theme.css` gives it.
 */

import { effect } from '@preact/signals';

import { applySpriteSlots, uiSprites } from '../art/uiSprites';

/** Follow the sprites from now on. Returns the function that stops following. */
export function mountUiTextures(root: HTMLElement = document.documentElement): () => void {
  return effect(() => applySpriteSlots(uiSprites.value, root));
}
