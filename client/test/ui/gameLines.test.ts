import { afterEach, describe, expect, it } from 'vitest';

import { setUiWords } from '../../src/ui/art/pieceStore';
import { LINES, say } from '../../src/ui/gameLines';

/** A strings file of `count` placeholders, with `line` at `at`. */
function build(count: number, at: number, line: string): string[] {
  const words = Array.from({ length: count }, (_, i) => `word ${i}`);
  words[at] = line;
  return words;
}

afterEach(() => setUiWords([]));

describe('say', () => {
  it('reads the line from the later build by its place there', () => {
    setUiWords(build(1911, LINES.dead.at[1911]!, 'SYNTHETIC DEAD'));
    expect(say(LINES.dead)).toBe('SYNTHETIC DEAD');
  });

  it('reads the same line from the earlier build at its own place', () => {
    setUiWords(build(1695, LINES.dead.at[1695]!, 'SYNTHETIC DEAD'));
    expect(say(LINES.dead)).toBe('SYNTHETIC DEAD');
  });

  it('uses its own wording before any strings arrive', () => {
    expect(say(LINES.dead)).toBe(LINES.dead.fallback);
  });

  it('uses its own wording on a build it does not recognise', () => {
    setUiWords(build(1200, 638, 'SYNTHETIC DEAD'));
    expect(say(LINES.dead)).toBe(LINES.dead.fallback);
  });

  it('uses its own wording where the build leaves the line blank', () => {
    setUiWords(build(1911, LINES.dead.at[1911]!, '  '));
    expect(say(LINES.dead)).toBe(LINES.dead.fallback);
  });

  it('places every line inside both builds', () => {
    for (const which of Object.values(LINES)) {
      for (const [count, at] of Object.entries(which.at)) expect(at).toBeLessThan(Number(count));
    }
  });
});
