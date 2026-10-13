import { afterEach, describe, expect, it } from 'vitest';

import { quoteDigest, screenSpec, uiSpec } from '../../src/ui/art/uiSpec';
import { setUiWords, uiWords } from '../../src/ui/art/pieceStore';

afterEach(() => {
  uiSpec.value = null;
  setUiWords([]);
});

describe('screenSpec', () => {
  it('says what a quoted caption reads', () => {
    // The spec quotes a caption by number and never by its words: what it
    // reads belongs to the build, and is read from the build.
    uiSpec.value = {
      screens: { auction: { dialog: 'd', captions: { head: '@2', other: 'ours' } } },
    };
    setUiWords(['zero', 'one', 'Sample heading']);
    expect(screenSpec('auction')?.captions).toEqual({ head: 'Sample heading', other: 'ours' });
  });

  it('quotes through lists and through the keys of a map', () => {
    uiSpec.value = {
      screens: {
        auction: {
          dialog: 'd',
          combos: [
            { control: 'c', list: 'l', value: 'v', of: 'x', options: ['@0', '@1'] },
            {
              control: 'd',
              list: 'l',
              value: 'v',
              of: 'y',
              follows: 'c',
              optionsBy: { '@0': ['@1'] },
            },
          ],
        },
      },
    };
    setUiWords(['All', 'Cloth']);
    const combos = screenSpec('auction')?.combos ?? [];
    expect(combos[0].options).toEqual(['All', 'Cloth']);
    expect(combos[1].optionsBy).toEqual({ All: ['Cloth'] });
  });

  it('takes the word a quote asks for when the build numbers it elsewhere', () => {
    // The same word sits six numbers apart on two shipped builds, and
    // the numbers of one of them put "Register" on a sign-in panel.
    uiSpec.value = {
      screens: { signIn: { dialog: 'd', captions: { account: '@8?Account' } } },
    };
    setUiWords(['', '', 'Account', 'Password', '', '', '', '', 'Register']);
    expect(screenSpec('signIn')?.captions).toEqual({ account: 'Account' });
  });

  it('keeps the number it was given where the word it asks for is in another language', () => {
    uiSpec.value = {
      screens: { signIn: { dialog: 'd', captions: { account: '@2?Account' } } },
    };
    setUiWords(['', '', 'Anmeldename', 'Kennwort']);
    expect(screenSpec('signIn')?.captions).toEqual({ account: 'Anmeldename' });
  });

  it('asks the build no questions where the number is already right', () => {
    uiSpec.value = {
      screens: { signIn: { dialog: 'd', captions: { account: '@2?account' } } },
    };
    setUiWords(['', '', 'Account', 'Account']);
    expect(screenSpec('signIn')?.captions).toEqual({ account: 'Account' });
  });

  it('takes a short word itself over a longer line that opens with it', () => {
    // A build whose numbers have moved puts a line opening with the word
    // at the number the quote gives.
    uiSpec.value = { screens: { social: { dialog: 'd', captions: { add: '@1?Add' } } } };
    setUiWords(['', 'Added [%s] to friends successfully.', 'Add']);
    expect(screenSpec('social')?.captions).toEqual({ add: 'Add' });
  });

  it('takes a long word by how it opens, since a quote cannot carry the whole of it', () => {
    uiSpec.value = {
      screens: { race: { dialog: 'd', words: { 'race:0': '@3?A long invented' } } },
    };
    setUiWords(['', '', '', 'A long invented sentence that runs past what one quote can carry.']);
    expect(screenSpec('race')?.words?.['race:0']).toMatch(/^A long invented sentence/);
  });

  it('counts along a run of words from the one it names', () => {
    // A run of sentences that open alike is found by its first entry,
    // and each of the rest by how far along the run it is.
    uiSpec.value = {
      screens: {
        held: { dialog: 'd', stats: { '9': '@2?First kind#0', '10': '@2?First kind#1' } },
      },
    };
    setUiWords(['', '', '', 'First kind %d', 'Gift of the same %d', 'Gift of another %d']);
    // Numbered one short in this build: the run is found by its words.
    expect(screenSpec('held')?.stats).toEqual({
      '9': 'First kind %d',
      '10': 'Gift of the same %d',
    });
  });

  it('takes the copy of a word nearest the number it was given', () => {
    uiSpec.value = { screens: { held: { dialog: 'd', captions: { kind: '@5?Other#1' } } } };
    setUiWords(['Other', 'Potion', '', 'Other', 'Cloth', '']);
    expect(screenSpec('held')?.captions).toEqual({ kind: 'Cloth' });
  });

  it('says nothing for a place past the end of the words', () => {
    uiSpec.value = { screens: { held: { dialog: 'd', stats: { '9': '@0?Only#3' } } } };
    setUiWords(['Only']);
    expect(screenSpec('held')?.stats).toEqual({ '9': '' });
  });

  it('shows nothing until the words have arrived', () => {
    // A number is the build's business. Putting one on screen is worse
    // than a caption that fills in a moment later.
    uiSpec.value = { screens: { auction: { dialog: 'd', captions: { head: '@2' } } } };
    expect(screenSpec('auction')?.captions).toEqual({ head: '' });
  });

  it('shows nothing where a number has no word behind it', () => {
    uiSpec.value = { screens: { auction: { dialog: 'd', captions: { head: '@9' } } } };
    setUiWords(['only one']);
    expect(screenSpec('auction')?.captions).toEqual({ head: '' });
  });

  it('holds still while nothing has changed', () => {
    // Screens hold the spec in their memos: a fresh object every render
    // would redraw every screen wearing shipped art, every frame.
    uiSpec.value = { screens: { auction: { dialog: 'd', captions: { head: '@0' } } } };
    setUiWords(['Name']);
    expect(screenSpec('auction')).toBe(screenSpec('auction'));
    expect(uiWords.value).toEqual(['Name']);
  });

  it('finds a word a quote names by a digest instead of carrying it', () => {
    const word = 'Account';
    uiSpec.value = {
      screens: {
        signIn: {
          dialog: 'd',
          captions: { account: `@2?~${quoteDigest(word.toLowerCase())}~${word.length}` },
        },
      },
    };
    setUiWords(['', '', 'Account', 'Password']);
    expect(screenSpec('signIn')?.captions).toEqual({ account: 'Account' });
  });

  it('relocates a digest quote onto the build that numbers the word elsewhere', () => {
    const word = 'Account';
    uiSpec.value = {
      screens: {
        signIn: {
          dialog: 'd',
          captions: { account: `@8?~${quoteDigest(word.toLowerCase())}~${word.length}` },
        },
      },
    };
    setUiWords(['', '', 'Account', '', '', '', '', '', 'Register']);
    expect(screenSpec('signIn')?.captions).toEqual({ account: 'Account' });
  });

  it('matches a digest of the opening words of a longer line', () => {
    const opening = 'a long invented';
    uiSpec.value = {
      screens: {
        race: { dialog: 'd', words: { 'race:0': `@3?~${quoteDigest(opening)}~${opening.length}` } },
      },
    };
    setUiWords(['', '', '', 'A long invented sentence that runs on.']);
    expect(screenSpec('race')?.words?.['race:0']).toMatch(/^A long invented sentence/);
  });
});
