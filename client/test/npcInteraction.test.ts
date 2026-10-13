/**
 * What can be talked to.
 *
 * Both cases pinned here were live bugs, and both presented identically: the
 * click did nothing at all, with no error anywhere to say why.
 */

import { describe, expect, it } from 'vitest';
import { approachArrived, approachStopDistance } from '../src/gameplay/approach';
import {
  hasQuestForPlayer,
  interactionFor,
  isCurrentGiverReply,
  isInteractable,
  serviceFor,
  showsOnMap,
  tapAction,
  tappedBody,
} from '../src/gameplay/npcInteraction';

const GOSSIP = 1 << 0;

describe('whether a body has a quest for this player', () => {
  it('believes the server over offersQuests', () => {
    // THE BUG: a tutorial giver carrying a quest through its quest relations
    // rather than its NPC-type flags could not be clicked, even while wearing
    // the quest mark the server had just sent for it.
    expect(hasQuestForPlayer({ npcFlags: 0, questMark: 'available' })).toBe(true);
  });

  it('believes the server when it says a giver has nothing left', () => {
    // The other direction: the flag outlives the quests. A giver that has run
    // out must fall through to gossip or trade, not keep offering nothing.
    expect(hasQuestForPlayer({ offersQuests: true, questMark: 'none' })).toBe(false);
  });

  it('falls back to offersQuests only until the first status sweep arrives', () => {
    expect(hasQuestForPlayer({ offersQuests: true })).toBe(true);
    expect(hasQuestForPlayer({ npcFlags: 0 })).toBe(false);
  });

  it('counts every state that is not "none"', () => {
    for (const status of ['available', 'incomplete', 'finished']) {
      expect(hasQuestForPlayer({ questMark: status })).toBe(true);
    }
  });
});

describe('whether clicking a body should do anything', () => {
  it('accepts a body the server has given a quest mark and no useful flags', () => {
    expect(isInteractable({ npcFlags: 0, questMark: 'available' })).toBe(true);
  });

  it('accepts anything wearing a head marker, by its real path', () => {
    // THE OTHER BUG: this test was `startsWith('ui_head_')` while every icon
    // is a full path under `ui/icons/head/`, so it matched nothing and the
    // whole fallback was dead from the day it was written.
    expect(
      isInteractable({
        interactionIcon: 'ui/icons/head/ui_head_questavailable.png',
      }),
    ).toBe(true);
  });

  it('still accepts the plain service flags', () => {
    expect(isInteractable({ npcFlags: GOSSIP })).toBe(true);
    expect(isInteractable({ npcFlags: 1 << 2 })).toBe(true);
    expect(isInteractable({ npcFlags: 1 << 25 })).toBe(true);
  });

  it('refuses a plain creature with nothing to say', () => {
    expect(isInteractable({ npcFlags: 0 })).toBe(false);
    expect(isInteractable({})).toBe(false);
    // A head marker of any kind counts, loot included — clicking a body with
    // one is how it opens. Only art that is not a head marker is not
    // an invitation to click.
    expect(isInteractable({ interactionIcon: 'ui/icons/minimap/arrow.png' })).toBe(false);
  });
});

describe('which body a tap lands on', () => {
  it('is the body the ray hit', () => {
    expect(tappedBody(7, null)).toBe(7);
  });

  it('is the wearer of the mark when the ray missed every body', () => {
    // THE BUG: a small NPC whose head mark is the only thing under the thumb
    // could not be clicked at all, because the mark was only ever consulted
    // after a body had been hit.
    expect(tappedBody(null, 9)).toBe(9);
  });

  it('never lets a mark override the body that was hit', () => {
    // A mark floats above its NPC; letting it win would stretch that NPC's
    // clickable area up over whoever stands behind it.
    expect(tappedBody(7, 9)).toBe(7);
  });

  it('is nothing when neither was hit', () => {
    expect(tappedBody(null, null)).toBeNull();
  });
});

describe('whether a quest.list reply still belongs to the giver on screen', () => {
  it('accepts a reply that names the giver currently open', () => {
    expect(isCurrentGiverReply(42, 42)).toBe(true);
  });

  it('rejects a reply for a giver that is no longer open', () => {
    // THE BUG: a reply for a giver the player already clicked away from used
    // to be drawn onto whichever dialog was open when it happened to land,
    // making every trainer nearby look like it offered the same quests.
    expect(isCurrentGiverReply(42, 7)).toBe(false);
  });

  it('rejects any reply when no dialog is open at all', () => {
    expect(isCurrentGiverReply(null, 42)).toBe(false);
  });
});

/*
 * ONE TAP TARGETS, A SECOND TAP ACTS.
 *
 * The point is that selecting is safe. A tap that both targeted a body and
 * did something to it is unrecoverable on a phone, where a thumb lands where
 * it lands — pick the wrong mob and you are in a fight you did not choose.
 */
describe('whether a tap targets a body or commits to it', () => {
  it('only targets a body that was not tapped last', () => {
    expect(tapAction({ alreadyTargeted: false, markWasHit: false, doubleTap: false })).toBe(
      'select',
    );
  });

  it('commits on a second tap on the body already tapped', () => {
    expect(tapAction({ alreadyTargeted: true, markWasHit: false, doubleTap: false })).toBe(
      'interact',
    );
  });

  it('commits on a double tap without needing to have selected first', () => {
    // The deliberate gesture. Two taps close together already say what they
    // mean, so nothing is gained by making the first of them only select.
    expect(tapAction({ alreadyTargeted: false, markWasHit: false, doubleTap: true })).toBe(
      'interact',
    );
  });

  it('commits on a tap that lands on the interaction mark', () => {
    // The mark is not part of the body, nothing else is under it, and hitting
    // one is already an unambiguous statement.
    expect(tapAction({ alreadyTargeted: false, markWasHit: true, doubleTap: false })).toBe(
      'interact',
    );
  });
});

describe('what committing to a body does', () => {
  it('loots anything dead, whatever it was in life', () => {
    // A corpse carries no gossip flag, no vendor flag and no head mark, so
    // every other test fails on one. Asking first is what makes a dead
    // shopkeeper a container rather than nothing at all.
    expect(interactionFor({ dead: true, canAttack: false, interactable: true })).toBe('loot');
  });

  it('attacks anything alive it is allowed to attack', () => {
    expect(interactionFor({ dead: false, canAttack: true, interactable: false })).toBe('attack');
  });

  it('attacks rather than talks when a body is both', () => {
    // A hostile NPC that also carries a gossip flag is a fight, not a chat.
    expect(interactionFor({ dead: false, canAttack: true, interactable: true })).toBe('attack');
  });

  it('talks to anything alive with something to say', () => {
    expect(interactionFor({ dead: false, canAttack: false, interactable: true })).toBe('talk');
  });

  it('does nothing to a body with nothing to offer', () => {
    expect(interactionFor({ dead: false, canAttack: false, interactable: false })).toBe('none');
  });
});

/*
 * How close an approach gets: where the hero comes to rest, always well inside
 * the ten units the server accepts an interaction from, so a target drifting
 * a step does not turn a working shop into a dead button.
 */
describe('how close an approach gets before it acts', () => {
  it('keeps its distance from a creature by the creature’s own size', () => {
    const small = approachStopDistance({ kind: 'creature', boundingRadius: 0.5 });
    const large = approachStopDistance({ kind: 'creature', boundingRadius: 4 });
    // A body is approached to its own edge, not walked into its middle.
    expect(large - small).toBeCloseTo(3.5);
  });

  it('stops clear of the body’s edge', () => {
    expect(approachStopDistance({ kind: 'creature', boundingRadius: 1.2 })).toBeGreaterThan(1.2);
    expect(approachStopDistance({ kind: 'player' })).toBeGreaterThan(0.5);
  });

  it('assumes a size for a creature that reports none', () => {
    // Nothing on the wire carries a body's radius, so this is the path every
    // creature takes. A zero here would walk the hero into it.
    expect(approachStopDistance({ kind: 'creature', boundingRadius: 0 })).toBe(
      approachStopDistance({ kind: 'creature' }),
    );
    expect(approachStopDistance({ kind: 'creature' })).toBeGreaterThan(1);
  });

  it('stops short of a static object by a distance of its own', () => {
    expect(approachStopDistance({ kind: 'static' })).toBeGreaterThan(0);
  });

  it('stays well inside the reach the server will accept, whatever it is told', () => {
    for (const range of [
      approachStopDistance({ kind: 'creature' }),
      approachStopDistance({ kind: 'creature', boundingRadius: 40 }),
      approachStopDistance({ kind: 'player' }),
      approachStopDistance({ kind: 'static' }),
    ]) {
      expect(range).toBeLessThanOrEqual(8);
    }
  });
});

describe('whether an approach has arrived', () => {
  it('has not arrived while further off than the reach', () => {
    expect(approachArrived([0, 0, 0], [10, 0, 0], 3)).toBe(false);
  });

  it('has arrived once inside it', () => {
    expect(approachArrived([0, 0, 0], [2, 0, 0], 3)).toBe(true);
  });

  it('counts height, so a target on a ledge is genuinely further away', () => {
    // Flattening this reports the hero arrived while they are still standing
    // underneath the thing they were sent to — a walk into a wall that never
    // ends and an interaction that never fires.
    expect(approachArrived([0, 0, 0], [0, 8, 0], 3)).toBe(false);
    expect(approachArrived([0, 0, 0], [2, 2, 0], 3)).toBe(true);
  });

  it('has not arrived exactly at the boundary', () => {
    expect(approachArrived([0, 0, 0], [3, 0, 0], 3)).toBe(false);
  });
});

describe('which NPCs get a pin on the map', () => {
  const bit = (n: number) => (1 << n) >>> 0;

  it('pins a shop and a teleporter', () => {
    for (const n of [2, 25]) expect(showsOnMap(bit(n)), `bit ${n}`).toBe(true);
  });

  it('pins no other service: trainers, the auction house, the stable master, crafting', () => {
    for (const n of [21, 22, 26, 29, 10, 15, 16, 18]) {
      expect(showsOnMap(bit(n)), `bit ${n}`).toBe(false);
    }
  });

  it('does not pin a villager who only chats, or a quest giver as such', () => {
    expect(showsOnMap(GOSSIP)).toBe(false);
    expect(showsOnMap(GOSSIP)).toBe(false);
  });

  it('pins a shop by its vendor bit, not by what it sells', () => {
    // The bits naming a vendor's wares mean nothing without the vendor bit.
    expect(showsOnMap(bit(5))).toBe(false);
    expect(showsOnMap(bit(2) | bit(5))).toBe(true);
  });

  it('reads the top bit without going negative', () => {
    expect(showsOnMap(bit(31))).toBe(false);
    expect(showsOnMap(bit(31) | bit(25))).toBe(true);
  });

  it('pins nothing with no flags', () => {
    expect(showsOnMap(0)).toBe(false);
  });
});

describe('which screen talking to a body opens', () => {
  const bit = (n: number) => (1 << n) >>> 0;
  const head = (name: string) => `ui/icons/head/ui_head_${name}.png`;

  it('opens a conversation with a villager who only chats', () => {
    // The gossip NPCs the dev map spawns carry the gossip bit and a quest
    // status of none: talking to one is a conversation, not a quest list.
    expect(serviceFor({ npcFlags: GOSSIP, questMark: 'none' })).toBe('talk');
    expect(serviceFor({ npcFlags: GOSSIP, offersQuests: true, questMark: 'none' })).toBe('talk');
    expect(serviceFor({ npcFlags: 0, interactionIcon: head('chat') })).toBe('talk');
  });

  it('opens the quest list while the giver has something for this player', () => {
    expect(serviceFor({ npcFlags: GOSSIP, offersQuests: true, questMark: 'available' })).toBe(
      'quests',
    );
    expect(serviceFor({ npcFlags: GOSSIP, offersQuests: true })).toBe('quests');
  });

  it('opens the shop before the conversation, and the auction house after the shop', () => {
    expect(serviceFor({ npcFlags: GOSSIP | bit(2), questMark: 'none' })).toBe('shop');
    expect(serviceFor({ npcFlags: GOSSIP | bit(21), questMark: 'none' })).toBe('auction');
    expect(serviceFor({ npcFlags: bit(2) | bit(21) })).toBe('shop');
  });

  it('opens the teleport map for a teleporter whatever else it offers', () => {
    expect(serviceFor({ npcFlags: GOSSIP | bit(2) | bit(25), questMark: 'available' })).toBe(
      'travel',
    );
    expect(serviceFor({ interactionIcon: head('teleport') })).toBe('travel');
  });

  it('asks for storage, the mailbox or a summon stone by head icon, and uses any other placed object', () => {
    expect(serviceFor({ kind: 'static', interactionIcon: head('storage') })).toBe('storage');
    expect(serviceFor({ kind: 'static', interactionIcon: head('mail') })).toBe('mail');
    expect(serviceFor({ kind: 'static', interactionIcon: head('summon') })).toBe('summon');
    expect(serviceFor({ kind: 'static' })).toBe('use');
  });

  it('does nothing for a creature that offers nothing', () => {
    expect(serviceFor({ npcFlags: 0, questMark: 'none' })).toBeNull();
  });
});
