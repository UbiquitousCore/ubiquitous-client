/**
 * The clip machine: a one-shot in front of a loop.
 *
 * What is worth pinning here is the *sequencing*, because that is the part
 * that was missing and the part a refactor would quietly flatten back into
 * "one clip per state". Each test is one thing a body should visibly do over
 * several frames.
 */

import { describe, expect, it } from 'vitest';
import {
  ClipMachine,
  combatPosture,
  movementOf,
  stunnedPosture,
} from '../src/gameplay/ClipMachine';
import type { Movement, Posture, Rig } from '../src/gameplay/ClipMachine';
import { combatClipName, UNARMED, weaponsFromHands } from '../src/gameplay/weaponClips';

/** Synthetic clip lengths, in seconds. */
const LENGTHS: Record<string, number> = {
  walk_forward: 1.2,
  idle: 2.0,
  run_normal: 0.73,
  walk_backward: 1.0,
  move_left: 0.73,
  move_right: 0.73,
  run_idle: 1.33,
  move_left_idle: 0.83,
  move_right_idle: 0.83,
  jump_start: 0.6,
  jump_air: 1.0,
  jump_land: 0.43,
  jumplandrun: 0.2,
  jump_in_place: 1.83,
  combat_ready: 1.5,
  combat_load: 0.6,
  combat_aim: 1.2,
  combat01: 0.8,
  magic_directed_gather: 1.1,
  emote_dance: 13.3,
};
const durationOf = (clip: string): number | null => LENGTHS[clip] ?? null;

const FRAME = 1 / 60;

class Driver {
  readonly machine = new ClipMachine();
  private rig: Rig = 'foot';

  mounted(): this {
    this.rig = 'mount';
    return this;
  }

  /** Hold one state for `seconds`, returning every distinct clip it played. */
  hold(posture: Posture, movement: Movement, seconds: number): string[] {
    const seen: string[] = [];
    for (let t = 0; t < seconds; t += FRAME) {
      const got = this.machine.update(posture, movement, this.rig, FRAME, durationOf);
      if (seen[seen.length - 1] !== got.clip) seen.push(got.clip);
    }
    return seen;
  }

  /** One frame of a state. */
  step(posture: Posture, movement: Movement): { clip: string; once: boolean } {
    return this.machine.update(posture, movement, this.rig, FRAME, durationOf);
  }
}

describe('a one-shot over a loop', () => {
  it('plays the primary, then falls through to the secondary', () => {
    const d = new Driver();
    expect(d.hold('jump', 'forward', 1.2)).toEqual(['jump_start', 'jump_air']);
  });

  it('marks the primary as a one-shot and the secondary as a loop', () => {
    const d = new Driver();
    expect(d.step('jump', 'forward')).toEqual({ clip: 'jump_start', once: true });
    d.hold('jump', 'forward', 0.7);
    expect(d.step('jump', 'forward').once).toBe(false);
  });

  it('does not restart the primary while the state stays put', () => {
    const d = new Driver();
    // If holding forward re-entered the state each frame, jump_start would
    // never finish and jump_air would never show.
    expect(d.hold('jump', 'forward', 2.0)).toEqual(['jump_start', 'jump_air']);
  });

  it('gives up on a primary whose clip never loads', () => {
    const d = new Driver();
    // `jump_start_left` has no length here, standing in for a clip the build
    // does not ship. Without the backstop this would hold that pose forever.
    const seen = d.hold('jump', 'left', 3.0);
    expect(seen[0]).toBe('jump_start_left');
    expect(seen[seen.length - 1]).toBe('jump_air_left');
  });
});

describe('a one-shot no state asked for', () => {
  it('plays for as long as its clip lasts, however long that is', () => {
    // A gesture or an emote runs well past a landing's length; cutting it at
    // the backstop for clips that never load stopped a dance a tenth of the
    // way through.
    const d = new Driver();
    d.step('stand', 'stop');
    d.machine.playOnce('emote_dance', durationOf);
    expect(d.hold('stand', 'stop', 13.2)).toEqual(['emote_dance']);
    expect(d.hold('stand', 'stop', 0.5)).toEqual(['emote_dance', 'idle']);
  });
});

describe('an emote at the end of a fight', () => {
  // A player who loses a duel begs while still in their guard; the server
  // then takes the guard down and their health changes, none of which is the
  // player moving.
  it('plays out through the guard coming down, and only moving cuts it short', () => {
    const d = new Driver();
    d.hold('guardMelee', 'stop', 0.5);
    d.machine.playOnce('emote_dance', durationOf);
    expect(d.step('guardMelee', 'stop')).toEqual({ clip: 'emote_dance', once: true });
    expect(d.hold('stand', 'stop', 13.2)).toEqual(['emote_dance']);
    expect(d.hold('stand', 'stop', 0.5)).toEqual(['emote_dance', 'idle']);
  });

  it('stops the moment the body moves', () => {
    const d = new Driver();
    d.hold('stand', 'stop', 0.5);
    d.machine.playOnce('emote_dance', durationOf);
    d.hold('stand', 'stop', 1);
    expect(d.step('run', 'forward')).toEqual({ clip: 'run_normal', once: false });
  });

  it('is not played over a body that is already moving', () => {
    const d = new Driver();
    d.hold('run', 'forward', 0.5);
    d.machine.playOnce('emote_dance', durationOf);
    expect(d.step('run', 'forward')).toEqual({ clip: 'run_normal', once: false });
    expect(d.machine.playingOneShot).toBe(false);
  });
});

describe('moving cancels whatever one-shot is running', () => {
  it('cuts a landing short when the player moves again', () => {
    const d = new Driver();
    d.step('landStill', 'stop');
    expect(d.machine.playingOneShot).toBe(true);
    // Starting to run cancels the landing immediately.
    expect(d.step('run', 'forward')).toEqual({ clip: 'run_normal', once: false });
    expect(d.machine.playingOneShot).toBe(false);
  });

  it('is what starting to swim does too', () => {
    const d = new Driver();
    d.step('landStill', 'stop');
    expect(d.step('swim', 'forward')).toEqual({ clip: 'swim_forward', once: false });
  });
});

describe('the whole jump, start to landing', () => {
  it('runs jump_start, jump_air, jumplandrun, then the run loop', () => {
    const d = new Driver();
    const seen: string[] = [];
    const record = (c: string): void => {
      if (seen[seen.length - 1] !== c) seen.push(c);
    };

    for (const c of d.hold('run', 'forward', 0.3)) record(c);
    for (const c of d.hold('jump', 'forward', 1.1)) record(c);
    // Touchdown while still holding forward.
    record(d.step('landMoving', 'forward').clip);
    for (const c of d.hold('run', 'forward', 0.5)) record(c);

    expect(seen).toEqual(['run_normal', 'jump_start', 'jump_air', 'jumplandrun', 'run_normal']);
  });

  it('lands standing when nothing is held, and idles after', () => {
    const d = new Driver();
    d.hold('jump', 'stop', 1.1);
    expect(d.step('landStill', 'stop').clip).toBe('jump_land');
    // `stand:stop` leaves the primary slot alone, so the landing plays out
    // rather than being cut off the frame after touchdown.
    const after = d.hold('stand', 'stop', 0.2);
    expect(after[0]).toBe('jump_land');
    expect(d.hold('stand', 'stop', 0.6).at(-1)).toBe('idle');
  });
});

describe('a movement one-shot never outlasts the backstop', () => {
  it('hands a long landing back to the loop by the backstop, so a jump never freezes on a pose', () => {
    const long = (clip: string): number | null => (clip === 'jump_land' ? 9 : durationOf(clip));
    const machine = new ClipMachine();
    const seen: string[] = [];
    const run = (posture: Posture, movement: Movement, seconds: number): void => {
      for (let t = 0; t < seconds; t += FRAME) {
        const got = machine.update(posture, movement, 'foot', FRAME, long);
        if (seen[seen.length - 1] !== got.clip) seen.push(got.clip);
      }
    };
    run('jump', 'stop', 1.1);
    run('landStill', 'stop', FRAME);
    run('stand', 'stop', 2.2);
    expect(seen.at(-1)).toBe('idle');
  });
});

describe('walking off an edge is not a jump', () => {
  it('keeps the movement loop rather than playing jump_start', () => {
    const d = new Driver();
    d.hold('run', 'forward', 0.3);
    const seen = d.hold('fall', 'forward', 0.8);
    expect(seen).toEqual(['run_normal']);
  });
});

describe('coming to a stop plays the settle clip', () => {
  it('runs run_idle between the run loop and idle', () => {
    const d = new Driver();
    d.hold('run', 'forward', 0.3);
    // `Game` feeds `stand` with the direction that was just released.
    const seen = d.hold('stand', 'forward', 1.6);
    expect(seen).toEqual(['run_idle', 'idle']);
  });
});

describe('a mount', () => {
  it('strafes on run_normal, not move_left', () => {
    const d = new Driver().mounted();
    expect(d.step('run', 'left').clip).toBe('run_normal');
    // A character does use its own strafe clip.
    expect(new Driver().step('run', 'left').clip).toBe('move_left');
  });

  it('plays the flourish once, then goes back to idling', () => {
    const d = new Driver().mounted();
    expect(d.hold('flourish', 'stop', 2.2)).toEqual(['jump_in_place', 'idle']);
  });

  it('cuts the flourish short the moment it is asked to move', () => {
    const d = new Driver().mounted();
    d.step('flourish', 'stop');
    expect(d.step('run', 'forward').clip).toBe('run_normal');
  });
});

describe('a weapon that is up', () => {
  it('holds the guard while standing and the aim while aiming', () => {
    // Standing: nothing in the one-shot layer for a melee guard, and a
    // single `combat_load` over a looping `combat_aim` for a bow.
    expect(new Driver().hold('guardMelee', 'stop', 3)).toEqual(['combat_ready']);
    expect(new Driver().hold('guardRanged', 'stop', 3)).toEqual(['combat_load', 'combat_aim']);
  });

  it('comes back up on stopping, having run in the meantime', () => {
    const d = new Driver();
    d.step('guardMelee', 'stop');
    expect(d.step('guardMelee', 'forward').clip).toBe('run_normal');
    // The point of making this a posture rather than a one-shot: the server
    // says a body has started attacking once, and says nothing more until it
    // stops, so the guard has to survive everything in between.
    expect(d.hold('guardMelee', 'stop', 2)).toEqual(['combat_ready']);
  });

  it('does not put a guard on a body in the air or in the water', () => {
    // A guard replaces the ground states and nothing else: there is no
    // aiming pose for a jump to be in.
    expect(combatPosture('melee', 'jump')).toBe('jump');
    expect(combatPosture('ranged', 'swim')).toBe('swim');
    expect(combatPosture('melee', 'landStill')).toBe('landStill');
  });

  it('replaces standing and travelling on foot, and only those', () => {
    expect(combatPosture('melee', 'stand')).toBe('guardMelee');
    expect(combatPosture('melee', 'run')).toBe('guardMelee');
    expect(combatPosture('melee', 'walk')).toBe('guardMelee');
    expect(combatPosture('ranged', 'stand')).toBe('guardRanged');
    // Weapon down: everything is exactly as it was.
    expect(combatPosture(null, 'stand')).toBe('stand');
    expect(combatPosture(null, 'run')).toBe('run');
  });
});

describe('movementOf', () => {
  it("maps this client's directions onto movement states", () => {
    expect(movementOf('idle')).toBe('stop');
    expect(movementOf('forward')).toBe('forward');
    expect(movementOf('backward')).toBe('backward');
    expect(movementOf('strafeLeft')).toBe('left');
    expect(movementOf('strafeRight')).toBe('right');
  });
});

describe('the clip each everyday state shows', () => {
  it('idles when standing still with nothing held', () => {
    expect(new Driver().hold('stand', 'stop', 1)).toEqual(['idle']);
  });

  it('loops the run clip when running forward', () => {
    expect(new Driver().step('run', 'forward')).toEqual({ clip: 'run_normal', once: false });
  });

  it('walks forward on the walk clip, but shares the run clips in every other direction', () => {
    expect(new Driver().step('walk', 'forward').clip).toBe('walk_forward');
    expect(new Driver().step('walk', 'backward').clip).toBe('walk_backward');
    expect(new Driver().step('walk', 'right').clip).toBe('move_right');
  });

  it('swims on the swim clips, with the backwards clip under its shipped spelling', () => {
    expect(new Driver().step('swim', 'stop').clip).toBe('swim_idle');
    expect(new Driver().step('swim', 'forward').clip).toBe('swim_forward');
    expect(new Driver().step('swim', 'backward').clip).toBe('swim_backword');
    expect(new Driver().step('swim', 'left').clip).toBe('swim_left');
  });

  it('jumps and lands sideways on the sided clips', () => {
    expect(new Driver().step('jump', 'right').clip).toBe('jump_start_right');
    expect(new Driver().step('landMoving', 'left').clip).toBe('jumplandrun_left');
    expect(new Driver().step('landStill', 'right').clip).toBe('jump_land_right');
    // Landing while backing up is a standing landing: there is no running
    // one for that direction.
    expect(new Driver().step('landMoving', 'backward').clip).toBe('jump_land');
  });

  it('holds the air pose for admin flight in every direction', () => {
    for (const m of ['stop', 'forward', 'left'] as const) {
      expect(new Driver().step('fly', m)).toEqual({ clip: 'jump_air', once: false });
    }
  });

  it('leaves a mount alone in the water, because deep water dismounts first', () => {
    const d = new Driver().mounted();
    d.step('stand', 'stop');
    expect(d.step('swim', 'forward')).toEqual({ clip: 'idle', once: false });
  });

  it('gives a mount no sided jump or landing clips', () => {
    expect(new Driver().mounted().step('jump', 'left').clip).toBe('jump_start');
    expect(new Driver().mounted().step('landMoving', 'right').clip).toBe('jumplandrun');
  });
});

describe('a weapon that is up, resolved against what the hands hold', () => {
  const hand = (itemClass: number, subClass: number) => ({ entry: 1, itemClass, subClass });
  const empty = { entry: 0, itemClass: 0, subClass: 0 };

  it('guards with the clip for the main-hand weapon', () => {
    // A two-handed sword in the main hand.
    const weapons = weaponsFromHands({ mainhand: hand(2, 8), offhand: empty, ranged: empty });
    const guard = new Driver().step(combatPosture('melee', 'stand'), 'stop').clip;
    expect(combatClipName(guard, weapons)).toBe('combat_ready_2h');
  });

  it('nocks and aims with the clips for the ranged weapon', () => {
    // A bow in the ranged slot.
    const weapons = weaponsFromHands({ mainhand: empty, offhand: empty, ranged: hand(2, 16) });
    const seen = new Driver().hold(combatPosture('ranged', 'stand'), 'stop', 3);
    expect(seen.map(c => combatClipName(c, weapons))).toEqual([
      'combat_load_bow',
      'combat_aim_bow',
    ]);
  });

  it('guards bare-handed on the clips an empty hand counts as', () => {
    const guard = new Driver().step(combatPosture('melee', 'stand'), 'stop').clip;
    expect(combatClipName(guard, UNARMED)).toBe('combat_ready_stave');
  });
});

describe('a stun', () => {
  it('takes over standing, walking, running and a held guard', () => {
    for (const ground of ['stand', 'walk', 'run', 'guardMelee', 'guardRanged'] as const) {
      expect(stunnedPosture(true, ground)).toBe('stunned');
    }
  });

  it('lets a body in the air or in the water finish what it is doing', () => {
    expect(stunnedPosture(true, 'jump')).toBe('jump');
    expect(stunnedPosture(true, 'swim')).toBe('swim');
    expect(stunnedPosture(true, 'landStill')).toBe('landStill');
  });

  it('changes nothing once it has ended', () => {
    expect(stunnedPosture(false, 'guardMelee')).toBe('guardMelee');
  });

  it('loops the stun clip on foot, and leaves a mount as it is', () => {
    expect(new Driver().hold('stunned', 'stop', 2)).toEqual(['stun']);
    const mount = new Driver().mounted();
    mount.hold('stand', 'stop', 0.5);
    expect(mount.hold('stunned', 'stop', 1)).toEqual(['idle']);
  });
});
