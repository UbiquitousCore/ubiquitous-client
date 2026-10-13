import { describe, expect, it } from 'vitest';

import { unavailableFaces } from '../../src/ui/art/wornState';

const spec = {
  unavailable: { send: 'btnsend/disable', claim: 'btnclaim/disable' },
};

describe('the face a screen turns to for what it cannot do', () => {
  it('draws the face for the thing that cannot be done, and only that one', () => {
    const faces = unavailableFaces(spec, { send: false, claim: true });
    expect(faces.shown).toEqual(['btnsend/disable']);
    expect(faces.hidden).toEqual(['btnclaim/disable']);
  });

  it('takes anything unsaid as available', () => {
    // A screen only names what it knows is out of reach.
    const faces = unavailableFaces(spec, {});
    expect(faces.shown).toEqual([]);
    expect(faces.hidden).toEqual(['btnsend/disable', 'btnclaim/disable']);
  });

  it('says nothing about a screen whose controls have no second face', () => {
    expect(unavailableFaces({}, { send: false })).toEqual({ shown: [], hidden: [] });
  });
});
