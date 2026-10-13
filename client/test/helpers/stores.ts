/**
 * Putting a module-level store back to how it starts.
 *
 * A signal declared at module scope outlives the test that touched it, so a
 * suite that leaves one dirty decides what the next one sees. These write the
 * store's own exported signals, which is the same surface `Game` writes
 * through — so a test that resets this way is still only reaching production
 * code, and `src/` ships no reset that nothing in the client calls.
 */

import { movies, uiWords } from '../../src/ui/art/pieceStore';
import { uiSprites } from '../../src/ui/art/uiSprites';
import { setDeathActions } from '../../src/ui/deathStore';
import { defaultOptions, options, OPTIONS_STORAGE_KEY } from '../../src/ui/optionsStore';
import { refusals } from '../../src/ui/protocolNotices';

/** Forget every interface movie read so far. */
export function clearMovies(): void {
  movies.value = new Map();
}

/** Forget the interface's own words. */
export function clearUiWords(): void {
  uiWords.value = [];
}

/** Forget every refusal the server has sent. */
export function clearRefusals(): void {
  refusals.value = [];
}

/**
 * Hand the death prompt buttons that do nothing.
 *
 * The game hands it real ones on world entry; a test that has not opened a
 * world needs the prompt to render without them doing anything.
 */
export function clearDeathActions(): void {
  setDeathActions({ reviveAtCemetery: () => {} });
}

/** Back to this device's defaults, with nothing saved. */
export function resetOptions(): void {
  options.value = defaultOptions();
  try {
    globalThis.localStorage?.removeItem(OPTIONS_STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}

/** Forget every interface sprite cut so far. */
export function clearUiSprites(): void {
  uiSprites.value = new Map();
}
