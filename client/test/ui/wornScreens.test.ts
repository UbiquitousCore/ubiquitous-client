import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Rules every screen that wears the shipped art has to keep.
 *
 * These are settled here rather than looked for on a rendered page,
 * because a rule checked against the code holds in every state a
 * screen can be in — and the states are where the looking gets expensive.
 * What only a rendered page can answer is asked by `dev/audit.mjs`.
 */

const UI = join(__dirname, '../../src/ui');

function sourcesIn(dir: string): { name: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map(entry => ({
      name: `${dir.slice(UI.length + 1)}/${entry.name}`,
      text: readFileSync(join(dir, entry.name), 'utf8'),
    }));
}

const screens = [...sourcesIn(join(UI, 'components')), ...sourcesIn(join(UI, 'art'))];

/** A line with none of its comment, since a comment may say the word. */
function code(text: string): string {
  return text
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

describe('what a worn screen may show', () => {
  it('never shows a field the words it was authored with', () => {
    // What a field ships with is whatever was typed into it while the
    // screen was being laid out — "asdasd", "asdfghjklpoiytre", "99" —
    // and none of it was meant to be read. Shown where the screen's own
    // word had not arrived, it put that gibberish in front of a player.
    // Captions go through `WornCaptions`, which cannot reach it. The spec
    // builder reads authored words in two places only: where the build's
    // own string file has the same word, and where the table names a field
    // whose words it takes — `dialogShape.test.ts` holds the first to it.
    const readers = ['art/piecePlan.ts', 'art/dialogShape.ts', 'art/screenSpecs.ts'];
    const guilty = screens.filter(
      file => !readers.includes(file.name) && /text\?\.words/.test(code(file.text)),
    );
    expect(
      guilty.map(file => file.name),
      'a screen may not fall back to the words a field was authored with',
    ).toEqual([]);
  });

  it('splits money in one place, so it cannot be split two ways', () => {
    // Three screens had their own copy of the rule and one of them was
    // wrong: a silver and a copper came out as a hundred and one copper.
    const guilty = screens.filter(file => {
      if (file.name === 'money.ts') return false;
      return /10_000|10000/.test(code(file.text)) && !/import .*(coinsOf|purseOf)/.test(file.text);
    });
    expect(
      guilty.map(file => file.name),
      'a screen splitting a sum into coins must use `coinsOf` or `purseOf` from money.ts',
    ).toEqual([]);
  });

  it('gives every control something to be named by', () => {
    // A control nobody can name is a control a screen reader cannot
    // offer, and four tabs and two card buttons reached a real session
    // without one. `dev/audit.mjs` asks the rendered page the same
    // question; this catches a new one before it is ever drawn.
    for (const file of screens) {
      for (const button of code(file.text)
        .split(/<button\b/)
        .slice(1)) {
        const open = button.slice(0, button.indexOf('>'));
        // A control that closes itself has nothing inside it to read, so
        // it can only be named. One with children is named by them.
        if (!open.trimEnd().endsWith('/')) continue;
        expect(
          /aria-label|aria-labelledby/.test(open),
          `${file.name}: a <button/> with nothing to name it —\n<button${open}>`,
        ).toBe(true);
      }
    }
  });
});
