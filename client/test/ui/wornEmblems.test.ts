import { afterEach, describe, expect, it } from 'vitest';

import { emblems, setEmblems, wantEmblems, wantedEmblems } from '../../src/ui/art/pieceStore';

afterEach(() => {
  emblems.value = new Map();
  wantedEmblems.value = [];
});

const picture = (): ImageBitmap => ({}) as ImageBitmap;

describe('the pictures a screen draws for itself', () => {
  it('asks for what it has not got, once', () => {
    wantEmblems(['a', 'b']);
    wantEmblems(['b', 'c']);
    expect(wantedEmblems.value).toEqual(['a', 'b', 'c']);
  });

  it('does not ask again for one that has arrived', () => {
    setEmblems(new Map([['a', picture()]]));
    wantEmblems(['a', 'b']);
    expect(wantedEmblems.value).toEqual(['b']);
  });

  it('keeps what arrived before', () => {
    setEmblems(new Map([['a', picture()]]));
    setEmblems(new Map([['b', picture()]]));
    expect([...emblems.value.keys()]).toEqual(['a', 'b']);
  });

  it('asks for nothing when asked for nothing', () => {
    wantEmblems(['']);
    expect(wantedEmblems.value).toEqual([]);
  });
});
