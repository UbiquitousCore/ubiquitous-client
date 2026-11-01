/**
 * An emote is written in the log from where the reader stands: what the
 * player did, what someone did to them, or what someone did to a third.
 * The strings here are stand-ins placed where 1.1.4's strings hold them.
 */

import { describe, expect, it } from 'vitest';

import { emoteLine } from '../src/ui/emoteLines';

const WORDS = Array.from({ length: 1695 }, () => '');
WORDS[447] = 'they-to-someone %s %s';
WORDS[467] = 'they-to-everyone %s';
WORDS[522] = 'you-to-someone %s';
WORDS[542] = 'you-to-everyone';
WORDS[562] = 'they-to-you %s';
WORDS[446] = 'bow they-to-someone %s %s';

describe('emoteLine', () => {
  it('names the emoter and their target for a third player watching', () => {
    expect(emoteLine({ emote: 'wave', by: 'Hero', at: 'Archer' }, WORDS)).toBe(
      'they-to-someone Hero Archer',
    );
  });

  it('tells the target it was aimed at them', () => {
    expect(emoteLine({ emote: 'wave', by: 'Hero', at: { you: true } }, WORDS)).toBe(
      'they-to-you Hero',
    );
  });

  it('is to everyone when nobody was selected', () => {
    expect(emoteLine({ emote: 'wave', by: 'Hero', at: null }, WORDS)).toBe('they-to-everyone Hero');
  });

  it('speaks to the player about their own emote', () => {
    expect(emoteLine({ emote: 'wave', by: null, at: 'Archer' }, WORDS)).toBe(
      'you-to-someone Archer',
    );
    expect(emoteLine({ emote: 'wave', by: null, at: null }, WORDS)).toBe('you-to-everyone');
  });

  it('finds each emote by its place in the game’s list', () => {
    expect(emoteLine({ emote: 'bow', by: 'Hero', at: 'Archer' }, WORDS)).toBe(
      'bow they-to-someone Hero Archer',
    );
  });

  it('writes nothing for an emote the game has no line for, or strings of another build', () => {
    expect(emoteLine({ emote: 'whistle', by: 'Hero', at: null }, WORDS)).toBeNull();
    expect(emoteLine({ emote: 'wave', by: 'Hero', at: null }, ['x'])).toBeNull();
  });
});
