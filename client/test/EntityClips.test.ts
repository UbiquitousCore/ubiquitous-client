/**
 * The clip driver both the player and every network entity now run on.
 *
 * The point of these is the *sharing*. The player's behaviour is pinned by
 * `ClipMachine.test.ts`; these pin that a body the server describes gets the
 * identical treatment — a jump that ends, a settle clip, and a mount that
 * changes the whole clip set.
 */

import { describe, expect, it } from 'vitest';
import { EntityClips } from '../src/gameplay/EntityClips';

const LENGTHS: Record<string, number> = {
  walk_forward: 1.2,
  move_left: 0.73,
  idle: 2.0,
  run_normal: 0.73,
  walk_backward: 1.0,
  run_idle: 1.33,
  jump_start: 0.6,
  jump_air: 1.0,
  jump_land: 0.43,
  jumplandrun: 0.2,
  combat_ready: 1.5,
  emote_beg: 3.0,
};

const durationOf = (clip: string): number | null => LENGTHS[clip] ?? null;

/** Run frames and collect every clip actually switched to. */
function play(
  clips: EntityClips,
  frames: Array<[Parameters<EntityClips['update']>[0], Parameters<EntityClips['update']>[1]]>,
  dt = 1 / 30,
): string[] {
  const seen: string[] = [];
  for (const [posture, movement] of frames) {
    const want = clips.update(posture, movement, dt, durationOf);
    if (want) seen.push(want.clip);
  }
  return seen;
}

describe('EntityClips', () => {
  it('runs a jump through take-off, air and landing rather than holding one pose', () => {
    const clips = new EntityClips();

    const seen = play(clips, [
      ['run', 'forward'],
      ...Array<['jump', 'forward']>(24).fill(['jump', 'forward']),
      ['landMoving', 'forward'],
      ...Array<['run', 'forward']>(24).fill(['run', 'forward']),
    ]);

    // Take-off is a one-shot, the air loop shows once it is done, the landing
    // is another one-shot, and the run loop comes back on its own, rather
    // than the body stopping at `jump_start`.
    expect(seen).toEqual(['run_normal', 'jump_start', 'jump_air', 'jumplandrun', 'run_normal']);
  });

  it('plays the settle clip when a held direction is released', () => {
    const clips = new EntityClips();

    const seen = play(clips, [
      ['run', 'forward'],
      ['stand', 'stop'],
      ...Array<['stand', 'stop']>(60).fill(['stand', 'stop']),
    ]);

    expect(seen).toEqual(['run_normal', 'run_idle', 'idle']);
  });

  it('does not settle out of a walk, because there is no clip for it', () => {
    const clips = new EntityClips();

    // `run_idle` eases a *run* down. No model in the packs ships a `walk_idle`,
    // and only 16 of 122 creature folders ship `run_idle` at all — so settling
    // out of a walk played a skid the body was never going fast enough to
    // need, or cut abruptly to idle on everything without the clip.
    const seen = play(clips, [
      ['walk', 'forward'],
      ...Array<['stand', 'stop']>(30).fill(['stand', 'stop']),
    ]);
    expect(seen).toEqual(['walk_forward', 'idle']);
  });

  it('still settles out of a run, which does have one', () => {
    const clips = new EntityClips();
    const seen = play(clips, [
      ['run', 'forward'],
      ...Array<['stand', 'stop']>(60).fill(['stand', 'stop']),
    ]);
    expect(seen).toEqual(['run_normal', 'run_idle', 'idle']);
  });

  it('walks rather than running slowly, which is a state of its own', () => {
    const clips = new EntityClips();
    // Walking forward has a clip of its own, and more creature models ship
    // walk_forward than run_normal.
    expect(play(clips, [['walk', 'forward']])).toEqual(['walk_forward']);
    expect(play(clips, [['run', 'forward']])).toEqual(['run_normal']);
    // Strafing shares the run clips.
    expect(play(clips, [['walk', 'left']])).toEqual(['move_left']);
  });

  it('shows the backwards walk when the body is going the way it is not facing', () => {
    const clips = new EntityClips();
    expect(play(clips, [['run', 'backward']])).toEqual(['walk_backward']);
  });

  it('switches clip sets when a body gets on a mount', () => {
    const clips = new EntityClips();
    play(clips, [['run', 'left']]);
    // A character side-steps; a mount turns and runs. Different rigs, same
    // state — which is the whole reason the mounted flag lives in here.
    clips.setMounted(true);
    expect(play(clips, [['run', 'left']])).toEqual(['run_normal']);
  });

  it('re-issues the current clip after the renderer catches up', () => {
    const clips = new EntityClips();
    expect(play(clips, [['stand', 'stop']])).toEqual(['idle']);
    // Asked for while there was no mixer to receive it: nothing is playing.
    expect(play(clips, [['stand', 'stop']])).toEqual([]);

    clips.invalidate();
    expect(play(clips, [['stand', 'stop']])).toEqual(['idle']);
  });

  it('lets an emote run down and settles back into the loop underneath', () => {
    const clips = new EntityClips();
    play(clips, [['stand', 'stop']]);

    clips.playOnce('jump_land', durationOf);
    const seen = play(clips, Array<['stand', 'stop']>(60).fill(['stand', 'stop']));

    expect(seen).toEqual(['jump_land', 'idle']);
  });

  it("plays the player's own begging out after a lost duel, through the guard coming down", () => {
    const clips = new EntityClips();
    play(clips, Array<['guardMelee', 'stop']>(10).fill(['guardMelee', 'stop']));
    clips.playOnce('emote_beg', durationOf);
    const seen = play(clips, [
      ['guardMelee', 'stop'],
      ...Array<['stand', 'stop']>(80).fill(['stand', 'stop']),
    ]);
    expect(seen).toEqual(['emote_beg']);
    expect(play(clips, Array<['stand', 'stop']>(20).fill(['stand', 'stop']))).toEqual(['idle']);
  });

  it('lets moving cancel an emote, as any other one-shot is cancelled', () => {
    const clips = new EntityClips();
    play(clips, [['stand', 'stop']]);
    clips.playOnce('jump_land', durationOf);
    play(clips, [['stand', 'stop']]);

    expect(play(clips, [['run', 'forward']])).toEqual(['run_normal']);
  });
});
