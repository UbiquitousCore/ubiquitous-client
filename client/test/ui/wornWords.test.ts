import { describe, expect, it } from 'vitest';

import { fill, markRuns, plain, runs } from '../../src/ui/art/wornWords';

/** What the build writes in place of angle brackets. */
const O = '\x12';
const C = '\x13';

describe('filling a sentence with holes in it', () => {
  it('fills the holes in the order they are written', () => {
    expect(fill('%s: %d', 'held', 4)).toBe('held: 4');
  });

  it('writes a hole asking for hexadecimal in hexadecimal', () => {
    // A colour reaches the sentence as a number and the sentence asks for
    // it in base sixteen; written in base ten it is a different colour.
    expect(fill("color='#%x'", 0xabcdef)).toBe("color='#abcdef'");
    expect(fill('%X', 255)).toBe('FF');
  });

  it('leaves a percent sign the sentence spells out', () => {
    expect(fill('100%% of %d', 3)).toBe('100% of 3');
  });

  it('leaves a hole nothing was given for alone', () => {
    // Half a sentence is worse than a sentence with a hole in it: the
    // hole says something is missing, and a silent gap does not.
    expect(fill('%d of %d', 2)).toBe('2 of %d');
  });

  it('reads the width and length a sentence writes into a hole', () => {
    expect(fill('%02d/%lu', 7, 9)).toBe('7/9');
  });
});

describe('the runs a sentence is written in', () => {
  it('gives a plain sentence back as one run in no colour of its own', () => {
    expect(runs('nothing marked')).toEqual([{ text: 'nothing marked' }]);
  });

  it('carries the colour a marked run asks for', () => {
    const said = runs(`${O}font color='#abcdef'${C}4${O}/font${C} held`);
    expect(said).toEqual([{ text: '4', colour: '#abcdef' }, { text: ' held' }]);
  });

  it('takes the markup off a sentence drawn in one colour', () => {
    // Drawn as it stands, the tag itself goes on screen.
    expect(plain(`${O}font color='#ff0000'${C}4${O}/font${C} held`)).toBe('4 held');
  });

  it('pads a colour the sentence wrote short back out to six figures', () => {
    // The colour reaches the sentence as a number written in base
    // sixteen, so a dark one comes out short. Taken as written, three
    // figures are read as a browser's own shorthand and come out bright.
    const said = runs(fill(`${O}font color='#%x'${C}x${O}/font${C}`, 0x00f00));
    expect(said[0]?.colour).toBe('#000f00');
  });
});

describe('picking out what a screen filled in', () => {
  it('splits a line at each mark, left to right, and leaves the words between plain', () => {
    expect(markRuns('go to Silence? It costs 6 Silver.', ['Silence', '6 Silver'], 'green')).toEqual(
      [
        { text: 'go to ' },
        { text: 'Silence', colour: 'green' },
        { text: '? It costs ' },
        { text: '6 Silver', colour: 'green' },
        { text: '.' },
      ],
    );
  });

  it('leaves out a mark the line does not hold, and a line with none whole', () => {
    expect(markRuns('nothing here', ['Silence'], 'green')).toEqual([{ text: 'nothing here' }]);
    expect(markRuns('', [], 'green')).toEqual([]);
  });

  it('finds a repeated word once for each mark, not the same one twice', () => {
    expect(markRuns('Silver and Silver', ['Silver', 'Silver'], 'g').map(run => run.colour)).toEqual(
      ['g', undefined, 'g'],
    );
  });
});
