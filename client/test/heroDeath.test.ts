/**
 * The hero's own dead flag and death pose.
 *
 * `NetworkBodies` keeps these two facts for every body the server spawns, and
 * is pinned for them; the hero's body is client-owned and is not one of those
 * actors, so it carries its own copy, with the rule that matters: a
 * `unit.died` for a body already down does nothing.
 *
 * The repeat is dropped before it reaches the death pose, the
 * killer and penalty fields, or the dialog — a second death message arrives
 * because the server sends it twice. So a repeat replays no animation and
 * re-raises no dialog, and the same holds when a death arrives with the
 * death dialog already open.
 */

import { describe, expect, it } from 'vitest';

import { HeroDeath } from '../src/gameplay/heroDeath';

describe('the hero being down', () => {
  it('starts on their feet', () => {
    expect(new HeroDeath().isDown).toBe(false);
  });

  it('goes down on the first death, and says that it was the first', () => {
    const hero = new HeroDeath();

    expect(hero.markDown()).toBe(true);
    expect(hero.isDown).toBe(true);
  });

  it('takes the death once, however many times the server sends it', () => {
    // The one rule this class exists for. A `false` is the caller's cue to
    // drop the whole message — no pose, no banner, no dialog.
    const hero = new HeroDeath();
    hero.markDown();

    expect(hero.markDown()).toBe(false);
    expect(hero.markDown()).toBe(false);
    expect(hero.isDown).toBe(true);
  });

  it('gets back up only on a revive', () => {
    const hero = new HeroDeath();
    hero.markDown();

    hero.revive();

    expect(hero.isDown).toBe(false);
  });

  it('goes down again on the next death after a revive', () => {
    const hero = new HeroDeath();
    hero.markDown();
    hero.revive();

    expect(hero.markDown()).toBe(true);
    expect(hero.isDown).toBe(true);
  });
});

describe('the death pose owed to the renderer', () => {
  it('owes nothing until a clip is held', () => {
    const hero = new HeroDeath();
    hero.markDown();

    expect(hero.takeClip()).toBeNull();
  });

  it('hands the held clip over exactly once', () => {
    // Played on the frame it is taken; asking again must not play it a
    // second time over a body already in the pose.
    const hero = new HeroDeath();
    hero.markDown();
    hero.holdClip('die_ground');

    expect(hero.takeClip()).toBe('die_ground');
    expect(hero.takeClip()).toBeNull();
  });

  it('refuses a clip that resolves after the hero is back up', () => {
    // The clip is looked up asynchronously, so a revive can land between the
    // death and the answer. A corpse's pose over a living body is exactly
    // the frame nobody wants.
    const hero = new HeroDeath();
    hero.markDown();
    hero.revive();

    hero.holdClip('die_ground');

    expect(hero.takeClip()).toBeNull();
  });

  it('drops a pose still owed when the revive arrives', () => {
    const hero = new HeroDeath();
    hero.markDown();
    hero.holdClip('die_ground');

    hero.revive();

    expect(hero.takeClip()).toBeNull();
  });

  it('holds no pose from a death that was dropped as a repeat', () => {
    // The repeat returns false and the caller stops, so nothing is held —
    // which is what keeps the animation from replaying on the corpse.
    const hero = new HeroDeath();
    hero.markDown();
    hero.holdClip('die_ground');
    hero.takeClip();

    expect(hero.markDown()).toBe(false);
    expect(hero.takeClip()).toBeNull();
  });
});
