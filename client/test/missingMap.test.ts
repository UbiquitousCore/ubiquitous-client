import { describe, expect, it } from 'vitest';
import { isMissingMapFailure, missingMapOffer } from '../src/app/helpers/world/missingMap';

describe('isMissingMapFailure', () => {
  it('recognises the failure of a pack that was never extracted, as an error or as text', () => {
    expect(isMissingMapFailure(new Error('pack map_12 has never been extracted'))).toBe(true);
    expect(isMissingMapFailure('map_12 has never been extracted')).toBe(true);
  });

  it('is false for any other failure', () => {
    expect(isMissingMapFailure(new Error('out of memory'))).toBe(false);
    expect(isMissingMapFailure(undefined)).toBe(false);
    expect(isMissingMapFailure({ message: 'never been extracted' })).toBe(false);
  });
});

describe('missingMapOffer', () => {
  it('offers to reconnect the remembered game file by name', () => {
    expect(missingMapOffer({ name: 'game.ipa' })).toEqual({
      prompt: 'This map has not been extracted yet.\n\nReconnect to game.ipa to load it.',
      label: 'Continue with game.ipa',
      skipLabel: 'Cancel',
    });
  });

  it('asks for the file when none is remembered', () => {
    expect(missingMapOffer(null)).toEqual({
      prompt: 'This map has not been extracted yet.\n\nChoose your .ipa to load it.',
      label: 'Choose game file...',
      skipLabel: 'Cancel',
    });
  });
});
