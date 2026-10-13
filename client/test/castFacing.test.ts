/** Who the hero turns to while casting: the spell's target, through the cast and a beat past its release. */

import { describe, expect, it } from 'vitest';

import { CAST_FACE_HOLD_MS, CastFacing } from '../src/gameplay/castFacing';

describe('facing the target of a cast', () => {
  it('turns to nobody until a spell is aimed at someone', () => {
    expect(new CastFacing().target(false, 0)).toBeNull();
  });

  it('faces the target for the whole of a cast that fills a bar', () => {
    const facing = new CastFacing();
    facing.aimed(7, 0);
    // Well past the hold: the bar filling is what keeps it.
    expect(facing.target(true, CAST_FACE_HOLD_MS * 10)).toBe(7);
  });

  it('holds the facing a beat past the release, then lets go', () => {
    const facing = new CastFacing();
    facing.aimed(7, 0);
    facing.released(5000);
    expect(facing.target(false, 5000 + CAST_FACE_HOLD_MS - 1)).toBe(7);
    expect(facing.target(false, 5000 + CAST_FACE_HOLD_MS)).toBeNull();
    // Let go for good, not only for that frame.
    expect(facing.target(true, 5000 + CAST_FACE_HOLD_MS)).toBeNull();
  });

  it('faces the target of an instant spell before the server answers', () => {
    const facing = new CastFacing();
    facing.aimed(7, 0);
    expect(facing.target(false, CAST_FACE_HOLD_MS - 1)).toBe(7);
  });

  it('lets go at once when the cast is refused or cut short', () => {
    const facing = new CastFacing();
    facing.aimed(7, 0);
    facing.dropped();
    expect(facing.target(true, 1)).toBeNull();
  });

  it('turns to the newer target when a second spell is aimed', () => {
    const facing = new CastFacing();
    facing.aimed(7, 0);
    facing.aimed(9, 10);
    expect(facing.target(true, 20)).toBe(9);
  });
});
