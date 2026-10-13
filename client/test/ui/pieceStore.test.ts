import { afterEach, describe, expect, it } from 'vitest';

import { setUiWords, takeUiWords, uiWords } from '../../src/ui/art/pieceStore';

afterEach(() => setUiWords([]));

describe('the interface’s own words', () => {
  it('takes the words a mounted build answers with', () => {
    expect(takeUiWords(['a', 'b'])).toEqual(['a', 'b']);
    expect(uiWords.value).toEqual(['a', 'b']);
  });

  it('refuses an empty answer, so the question gets asked again', () => {
    // Taken as final, an empty answer leaves every control with nothing
    // written on it. A build with nothing mounted answers with no words rather than
    // by failing, and the ask is only repeated on an answer of nothing —
    // so taking that one settles it for the rest of the session.
    setUiWords(['kept']);
    expect(takeUiWords([])).toBeNull();
    expect(uiWords.value).toEqual(['kept']);
  });
});
